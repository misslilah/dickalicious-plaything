import { normalizeSupabaseUrl, getSupabaseConfigStatus } from './supabase';

/** Patreon page for upgrades (marketing link). */
export function getPatreonPageUrl(): string {
  return (
    (import.meta.env.VITE_PATREON_PAGE_URL as string | undefined)?.trim() ||
    'https://www.patreon.com/'
  );
}

/** Start Patreon OAuth via Supabase Edge Function. */
export function getPatreonOAuthStartUrl(userId: string, returnTo = '/settings'): string | null {
  const status = getSupabaseConfigStatus();
  if (!status.configured || !status.urlHost) return null;

  const base = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string);
  const params = new URLSearchParams({
    user_id: userId,
    return_to: returnTo,
  });
  return `${base}/functions/v1/patreon-oauth-start?${params.toString()}`;
}

export function isPatreonOAuthConfigured(): boolean {
  return getPatreonOAuthStartUrl('00000000-0000-0000-0000-000000000000') != null;
}
