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
      warning?: string;
    }
  | { ok: false; error: string; fallback?: string };

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

  const { data, error, response } = await supabase.functions.invoke(
    'throne-fetch-gifts',
    { body: { username: resolvedUsername } },
  );

  if (error) {
    const generic =
      error.message === 'Edge Function returned a non-2xx status code'
        ? 'Throne gift fetch failed.'
        : error.message || 'Could not fetch Throne gifts.';
    const parsed = await readEdgeFunctionError(response, generic);
    return {
      ok: false,
      error: parsed.error,
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
        warning?: string;
      }
    | null;

  if (!payload?.ok) {
    return {
      ok: false,
      error: payload?.error || 'Could not fetch Throne gifts.',
      fallback: payload?.fallback,
    };
  }

  return {
    ok: true,
    username: payload.username ?? resolvedUsername,
    gifts: payload.gifts ?? [],
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    warning: payload.warning,
  };
}
