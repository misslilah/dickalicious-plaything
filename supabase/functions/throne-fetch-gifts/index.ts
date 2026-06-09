import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/throne.ts';
import {
  createServiceSupabase,
  fetchCatalogGiftsFromDb,
  upsertScrapedGiftsToCatalog,
} from '../_shared/throneGiftCatalogDb.ts';
import {
  fetchThroneWishlistGifts,
  jsonResponse,
  parseThroneUsername,
  resolveThroneUsername,
  THRONE_RATE_LIMIT_MESSAGE,
} from '../_shared/throneWishlist.ts';

async function requireAdmin(
  req: Request,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Not signed in.' }, 401),
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const anonKey =
    Deno.env.get('SUPABASE_ANON_KEY')?.trim() ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ??
    '';
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: 'Supabase is not configured on the server.' },
        503,
      ),
    };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Invalid session.' }, 401),
    };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || !isAdmin) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Admin only.' }, 403),
    };
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;

  let body: { username?: string | null; forceRefresh?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const username = resolveThroneUsername(body.username);
  if (!username) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Throne username required. The client should send { "username": "your-name" } from VITE_THRONE_URL, or set THRONE_USERNAME / THRONE_PROFILE_URL in Edge Function secrets.',
        hint: 'Example: https://throne.com/u/your-name → username "your-name".',
        fallback: 'Add gifts manually to the catalog in Manage punishments.',
      },
      400,
    );
  }

  if (!parseThroneUsername(username)) {
    return jsonResponse({ ok: false, error: 'Invalid Throne username.' }, 400);
  }

  const serviceSupabase = createServiceSupabase();

  try {
    const result = await fetchThroneWishlistGifts(username, {
      forceRefresh: body.forceRefresh === true,
    });

    if (serviceSupabase) {
      await upsertScrapedGiftsToCatalog(serviceSupabase, result.gifts);
    }

    const catalogGifts = serviceSupabase
      ? await fetchCatalogGiftsFromDb(serviceSupabase)
      : result.gifts.map((gift) => ({
          id: gift.id,
          title: gift.title,
          priceCents: gift.priceCents,
          currency: gift.currency,
          url: gift.url,
          throneGiftId: gift.id,
          imageUrl: gift.imageUrl,
        }));

    return jsonResponse({
      ok: true,
      username: result.username,
      gifts: catalogGifts.length > 0 ? catalogGifts : result.gifts,
      fetchedAt: result.fetchedAt,
      cached: result.cached,
      source: 'throne_public_profile',
      warning:
        'Unofficial scrape of Throne public profile data — may break if Throne changes their site. Saved catalog gifts remain available when scraping fails.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[throne-fetch-gifts] scrape failed:', message);
    const isRateLimit =
      message === THRONE_RATE_LIMIT_MESSAGE || /\b429\b|rate limit/i.test(message);

    const cachedGifts =
      serviceSupabase != null
        ? await fetchCatalogGiftsFromDb(serviceSupabase)
        : [];

    return jsonResponse(
      {
        ok: false,
        error: isRateLimit ? THRONE_RATE_LIMIT_MESSAGE : message,
        username,
        cachedGifts,
        fallback:
          cachedGifts.length > 0
            ? 'Your saved catalog gifts are still available — pick one below or add manually.'
            : 'Add gifts manually to the catalog in Manage punishments (quick-add tiers below).',
      },
      isRateLimit ? 429 : 502,
    );
  }
});
