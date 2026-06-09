import { getThroneUsername } from './throne';
import { getSupabase } from './supabase';

export type ThroneGiftCatalogItem = {
  /** Catalog row id (uuid) — use for dropdown selection. */
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  url: string;
  imageUrl?: string | null;
  /** Throne wishlist item id when known (webhook secondary metadata). */
  throneGiftId?: string | null;
};

export type FetchThroneGiftsResult =
  | {
      ok: true;
      username: string;
      gifts: ThroneGiftCatalogItem[];
      fetchedAt: string;
      cached?: boolean;
      warning?: string;
    }
  | { ok: false; error: string; fallback?: string; cachedGifts?: ThroneGiftCatalogItem[] };

export type ThroneGiftCatalogDraft = {
  title: string;
  priceCents: number;
  currency?: string;
  url: string;
  throneGiftId?: string | null;
  sortOrder?: number;
};

type DbCatalogRow = {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  url: string;
  throne_gift_id: string | null;
  sort_order: number;
  created_at: string;
};

const CLIENT_CACHE_TTL_MS = 45 * 60 * 1000;

type ClientCacheEntry = {
  result: Extract<FetchThroneGiftsResult, { ok: true }>;
  fetchedAt: number;
};

const clientCache = new Map<string, ClientCacheEntry>();

export const THRONE_RATE_LIMIT_MESSAGE =
  'Throne rate limit — wait a minute and click Refresh, or add gifts manually to the catalog.';

export const THRONE_QUICK_TIER_PRESETS = [
  { label: 'Tier 1 (€5)', priceCents: 500, sortOrder: 10 },
  { label: 'Tier 2 (€25)', priceCents: 2500, sortOrder: 20 },
  { label: 'Tier 3 (€125)', priceCents: 12500, sortOrder: 30 },
] as const;

function mapDbRow(row: DbCatalogRow): ThroneGiftCatalogItem {
  return {
    id: row.id,
    title: row.title,
    priceCents: row.price_cents,
    currency: row.currency,
    url: row.url,
    throneGiftId: row.throne_gift_id,
  };
}

/** Load saved catalog gifts from Supabase (admin RLS). Always works without scraping. */
export async function fetchCatalogFromDb(): Promise<
  { ok: true; gifts: ThroneGiftCatalogItem[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('throne_gift_catalog')
    .select('id, title, price_cents, currency, url, throne_gift_id, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('price_cents', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    if (/throne_gift_catalog/i.test(error.message) && /does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: 'Gift catalog table missing — run migration 079_throne_gift_catalog.sql in Supabase.',
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, gifts: (data ?? []).map((row) => mapDbRow(row as DbCatalogRow)) };
}

/** Admin: insert a gift into the persistent catalog. */
export async function addGiftToCatalog(
  draft: ThroneGiftCatalogDraft,
): Promise<{ ok: true; gift: ThroneGiftCatalogItem } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const title = draft.title.trim();
  const url = draft.url.trim();
  if (!title) return { ok: false, error: 'Gift title is required.' };
  if (!url) return { ok: false, error: 'Throne gift URL is required.' };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Gift URL must start with http:// or https://.' };
  }
  if (!Number.isFinite(draft.priceCents) || draft.priceCents <= 0) {
    return { ok: false, error: 'Enter a valid gift price in cents.' };
  }

  const { data, error } = await supabase
    .from('throne_gift_catalog')
    .insert({
      title,
      price_cents: Math.round(draft.priceCents),
      currency: (draft.currency ?? 'EUR').trim().toUpperCase() || 'EUR',
      url,
      throne_gift_id: draft.throneGiftId?.trim() || null,
      sort_order: draft.sortOrder ?? 0,
    })
    .select('id, title, price_cents, currency, url, throne_gift_id, sort_order, created_at')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, gift: mapDbRow(data as DbCatalogRow) };
}

/** Admin: remove a catalog gift. */
export async function deleteGiftFromCatalog(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { error } = await supabase.from('throne_gift_catalog').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Return in-memory cached scrape results for this session (no network). */
export function getCachedThroneGifts(
  username: string | null | undefined,
): Extract<FetchThroneGiftsResult, { ok: true }> | null {
  if (!username) return null;
  const key = username.toLowerCase();
  const entry = clientCache.get(key);
  if (!entry || Date.now() - entry.fetchedAt > CLIENT_CACHE_TTL_MS) {
    if (entry) clientCache.delete(key);
    return null;
  }
  return entry.result;
}

function storeCachedThroneGifts(
  username: string,
  result: Extract<FetchThroneGiftsResult, { ok: true }>,
): void {
  clientCache.set(username.toLowerCase(), {
    result,
    fetchedAt: Date.now(),
  });
}

function friendlyThroneError(message: string): string {
  if (/\b429\b|rate limit/i.test(message)) {
    return THRONE_RATE_LIMIT_MESSAGE;
  }
  return message;
}

function formatGiftPrice(gift: ThroneGiftCatalogItem): string {
  const amount = (gift.priceCents / 100).toFixed(2);
  return `${gift.currency} ${amount}`;
}

export function formatThroneGiftOptionLabel(gift: ThroneGiftCatalogItem): string {
  return `${gift.title} — ${formatGiftPrice(gift)}`;
}

type EdgeFunctionErrorBody = {
  error?: string;
  message?: string;
  fallback?: string;
  hint?: string;
  cachedGifts?: ThroneGiftCatalogItem[];
};

/** Read error body from a non-2xx edge function response. */
async function readEdgeFunctionError(
  response: Response | undefined,
  fallbackMessage: string,
): Promise<{ error: string; fallback?: string; cachedGifts?: ThroneGiftCatalogItem[] }> {
  if (!response) {
    return { error: fallbackMessage };
  }

  try {
    const body = (await response.clone().json()) as EdgeFunctionErrorBody;
    const message =
      (typeof body.error === 'string' && body.error.trim()) ||
      (typeof body.message === 'string' && body.message.trim()) ||
      fallbackMessage;
    const hint =
      typeof body.hint === 'string' && body.hint.trim() ? body.hint.trim() : null;
    return {
      error: hint ? `${message} ${hint}` : message,
      fallback:
        typeof body.fallback === 'string' ? body.fallback : undefined,
      cachedGifts: Array.isArray(body.cachedGifts) ? body.cachedGifts : undefined,
    };
  } catch {
    return { error: fallbackMessage };
  }
}

const NO_USERNAME_ERROR =
  'Throne username not configured. Set VITE_THRONE_URL=https://throne.com/u/your-username in .env (and on Vercel), or set THRONE_USERNAME / THRONE_PROFILE_URL in Supabase Edge Function secrets.';

/** Admin-only: scrape Throne wishlist via edge function and merge into DB catalog. */
export async function refreshFromThrone(
  username?: string | null,
  options?: { forceRefresh?: boolean },
): Promise<FetchThroneGiftsResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const resolvedUsername = username?.trim() || getThroneUsername();
  if (!resolvedUsername) {
    return {
      ok: false,
      error: NO_USERNAME_ERROR,
      fallback: 'Add gifts manually to the catalog below.',
    };
  }

  if (!options?.forceRefresh) {
    const cached = getCachedThroneGifts(resolvedUsername);
    if (cached) return cached;
  }

  const { data, error, response } = await supabase.functions.invoke(
    'throne-fetch-gifts',
    {
      body: {
        username: resolvedUsername,
        forceRefresh: options?.forceRefresh === true,
      },
    },
  );

  if (error) {
    const generic =
      error.message === 'Edge Function returned a non-2xx status code'
        ? 'Throne gift fetch failed.'
        : error.message || 'Could not fetch Throne gifts.';
    const parsed = await readEdgeFunctionError(response, generic);
    const dbCatalog = await fetchCatalogFromDb();
    const cachedGifts =
      parsed.cachedGifts ??
      (dbCatalog.ok && dbCatalog.gifts.length > 0 ? dbCatalog.gifts : undefined);
    return {
      ok: false,
      error: friendlyThroneError(parsed.error),
      fallback:
        parsed.fallback ??
        (cachedGifts?.length
          ? 'Your saved catalog gifts are still available — pick one below or add manually.'
          : 'Add gifts manually to the catalog below.'),
      cachedGifts,
    };
  }

  const payload = data as
    | {
        ok?: boolean;
        error?: string;
        fallback?: string;
        username?: string;
        gifts?: ThroneGiftCatalogItem[];
        fetchedAt?: string;
        cached?: boolean;
        warning?: string;
      }
    | null;

  if (!payload?.ok) {
    const dbCatalog = await fetchCatalogFromDb();
    return {
      ok: false,
      error: friendlyThroneError(payload?.error || 'Could not fetch Throne gifts.'),
      fallback: payload?.fallback,
      cachedGifts: dbCatalog.ok ? dbCatalog.gifts : undefined,
    };
  }

  const dbAfterRefresh = await fetchCatalogFromDb();
  const gifts = dbAfterRefresh.ok ? dbAfterRefresh.gifts : (payload.gifts ?? []);

  const success: Extract<FetchThroneGiftsResult, { ok: true }> = {
    ok: true,
    username: payload.username ?? resolvedUsername,
    gifts,
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    cached: payload.cached,
    warning: payload.warning,
  };
  storeCachedThroneGifts(success.username, success);
  return success;
}

/** @deprecated Use fetchCatalogFromDb + refreshFromThrone instead. */
export async function fetchThroneGifts(
  username?: string | null,
  options?: { forceRefresh?: boolean },
): Promise<FetchThroneGiftsResult> {
  return refreshFromThrone(username, options);
}
