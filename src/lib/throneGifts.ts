import { getThroneUsername } from './throne';
import { getSupabase } from './supabase';

export type ThroneGiftCatalogItem = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  url: string;
  imageUrl?: string | null;
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
  | { ok: false; error: string; fallback?: string };

const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;

type ClientCacheEntry = {
  result: Extract<FetchThroneGiftsResult, { ok: true }>;
  fetchedAt: number;
};

const clientCache = new Map<string, ClientCacheEntry>();

export const THRONE_RATE_LIMIT_MESSAGE =
  'Throne rate limit — wait a minute and click Refresh, or use manual EUR entry.';

/** Return in-memory cached gifts for this session (no network). */
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
};

/** Read { error } from a non-2xx edge function response (Supabase hides it in error.context). */
async function readEdgeFunctionError(
  response: Response | undefined,
  fallbackMessage: string,
): Promise<{ error: string; fallback?: string }> {
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
    };
  } catch {
    return { error: fallbackMessage };
  }
}

const NO_USERNAME_ERROR =
  'Throne username not configured. Set VITE_THRONE_URL=https://throne.com/u/your-username in .env (and on Vercel), or set THRONE_USERNAME / THRONE_PROFILE_URL in Supabase Edge Function secrets.';

/** Admin-only: fetch live wishlist gifts via throne-fetch-gifts edge function. */
export async function fetchThroneGifts(
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
      fallback: 'Enter gift amount and Open URL manually.',
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
    return {
      ok: false,
      error: friendlyThroneError(parsed.error),
      fallback:
        parsed.fallback ?? 'Enter gift amount and Open URL manually.',
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
    return {
      ok: false,
      error: friendlyThroneError(payload?.error || 'Could not fetch Throne gifts.'),
      fallback: payload?.fallback,
    };
  }

  const success: Extract<FetchThroneGiftsResult, { ok: true }> = {
    ok: true,
    username: payload.username ?? resolvedUsername,
    gifts: payload.gifts ?? [],
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    cached: payload.cached,
    warning: payload.warning,
  };
  storeCachedThroneGifts(success.username, success);
  return success;
}
