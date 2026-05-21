import { normalizeSupabaseUrl, getSupabaseConfigStatus } from './supabase';

/** Patreon page for upgrades (marketing link). */
export function getPatreonPageUrl(): string {
  return (
    (import.meta.env.VITE_PATREON_PAGE_URL as string | undefined)?.trim() ||
    'https://www.patreon.com/'
  );
}

/** Start Patreon OAuth via Supabase Edge Function (full-page navigation). */
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

/** True when VITE_SUPABASE_URL is set (does not mean Edge Functions are deployed). */
export function isPatreonOAuthConfigured(): boolean {
  return getPatreonOAuthStartUrl('00000000-0000-0000-0000-000000000000') != null;
}

export type PatreonOAuthProbeStatus =
  | 'ready'
  | 'not_deployed'
  | 'server_not_configured'
  | 'no_supabase'
  | 'unknown';

function supabaseFunctionHeaders(): HeadersInit {
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!key) return {};
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
}

/** Check whether patreon-oauth-start is deployed and responding. */
export async function probePatreonOAuthStart(): Promise<PatreonOAuthProbeStatus> {
  const startUrl = getPatreonOAuthStartUrl('00000000-0000-0000-0000-000000000000');
  if (!startUrl) return 'no_supabase';

  try {
    const res = await fetch(startUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: supabaseFunctionHeaders(),
    });
    if (res.status === 404) return 'not_deployed';
    if (res.status === 503) return 'server_not_configured';
    if (res.status === 302 || res.status === 303 || res.status === 307) return 'ready';
    if (res.ok) return 'ready';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function patreonOAuthStatusMessage(
  status: PatreonOAuthProbeStatus,
  isAdmin = false,
): string | null {
  switch (status) {
    case 'not_deployed':
      return isAdmin
        ? 'Patreon OAuth Edge Functions are not deployed. Install the Supabase CLI, link your project, and run: supabase functions deploy patreon-oauth-start patreon-oauth-callback patreon-webhook (see README).'
        : 'Patreon connection is not available yet. Ask an admin to deploy Supabase Edge Functions first.';
    case 'server_not_configured':
      return isAdmin
        ? 'Edge Functions are deployed but Patreon secrets are missing. Set PATREON_CLIENT_ID and PATREON_REDIRECT_URI in Supabase Dashboard → Edge Functions → Secrets.'
        : 'Patreon OAuth is not fully configured on the server yet. Try again later or ask an admin.';
    case 'no_supabase':
      return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.';
    default:
      return null;
  }
}

/** Probe then navigate to OAuth start (redirects to Patreon when deployed). */
export async function connectPatreonAccount(
  userId: string,
  returnTo = '/settings',
  options?: { isAdmin?: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const startUrl = getPatreonOAuthStartUrl(userId, returnTo);
  if (!startUrl) {
    return {
      ok: false,
      message:
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.',
    };
  }

  const probe = await probePatreonOAuthStart();
  const blockMessage = patreonOAuthStatusMessage(probe, options?.isAdmin);
  if (blockMessage) {
    return { ok: false, message: blockMessage };
  }

  window.location.assign(startUrl);
  return { ok: true };
}
