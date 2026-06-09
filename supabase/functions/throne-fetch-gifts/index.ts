import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/throne.ts';
import {
  fetchThroneWishlistGifts,
  jsonResponse,
  parseThroneUsername,
  resolveThroneUsername,
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

  let body: { username?: string | null } = {};
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
        fallback: 'Enter Throne gift amount and Open URL manually in the punishment form.',
      },
      400,
    );
  }

  if (!parseThroneUsername(username)) {
    return jsonResponse({ ok: false, error: 'Invalid Throne username.' }, 400);
  }

  try {
    const result = await fetchThroneWishlistGifts(username);
    return jsonResponse({
      ok: true,
      username: result.username,
      gifts: result.gifts,
      fetchedAt: new Date().toISOString(),
      source: 'throne_public_profile',
      warning:
        'Unofficial scrape of Throne public profile data — may break if Throne changes their site. Webhook matching still uses gift amount (cents).',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[throne-fetch-gifts] scrape failed:', message);
    return jsonResponse(
      {
        ok: false,
        error: message,
        username,
        fallback: 'Enter Throne gift amount and Open URL manually in the punishment form.',
      },
      502,
    );
  }
});
