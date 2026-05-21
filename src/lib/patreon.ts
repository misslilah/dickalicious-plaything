import { normalizeSupabaseUrl, getSupabaseConfigStatus, getSupabase } from './supabase';

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
  return getPatreonOAuthProbeUrl() != null;
}

/** Probe URL — checks secrets without starting OAuth. */
export function getPatreonOAuthProbeUrl(): string | null {
  const status = getSupabaseConfigStatus();
  if (!status.configured || !status.urlHost) return null;

  const base = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string);
  return `${base}/functions/v1/patreon-oauth-start?probe=1`;
}

export type PatreonOAuthProbeStatus =
  | 'ready'
  | 'not_deployed'
  | 'server_not_configured'
  | 'no_supabase'
  | 'unknown';

export type PatreonOAuthProbeResult = {
  status: PatreonOAuthProbeStatus;
  missingSecrets?: string[];
  serverError?: string;
};

type PatreonOAuthConfigErrorBody = {
  error?: string;
  missing_secrets?: string[];
};

type PatreonOAuthProbeBody = {
  ok?: boolean;
  error?: string;
  missing?: string[];
  missing_secrets?: string[];
};

function parseMissingSecretNames(body: PatreonOAuthProbeBody): string[] {
  const fromMissing = Array.isArray(body.missing) ? body.missing : [];
  const fromLegacy = Array.isArray(body.missing_secrets) ? body.missing_secrets : [];
  const names = [...fromMissing, ...fromLegacy];
  return names.filter((name): name is string => typeof name === 'string' && name.length > 0);
}

function getAnonKey(): string | null {
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  return key || null;
}

const OAUTH_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type PatreonOAuthStartBody = {
  redirectUrl?: string;
  url?: string;
  error?: string;
  message?: string;
  code?: string;
};

/** Headers required by the Supabase Edge Functions gateway. */
function supabaseFunctionHeaders(accessToken?: string | null): HeadersInit {
  const anonKey = getAnonKey();
  if (!anonKey) return {};
  const bearer = accessToken?.trim() || anonKey;
  return {
    Authorization: `Bearer ${bearer}`,
    apikey: anonKey,
  };
}

function oauthRedirectFromResponse(res: Response): string | null {
  if (!OAUTH_REDIRECT_STATUSES.has(res.status)) return null;
  const location = res.headers.get('Location')?.trim();
  return location || null;
}

function parseOAuthStartRedirect(body: PatreonOAuthStartBody): string | null {
  const target = body.redirectUrl?.trim() || body.url?.trim();
  return target || null;
}

function messageForGatewayAuthFailure(
  body: PatreonOAuthStartBody | null,
  isAdmin = false,
): string {
  if (body?.code === 'UNAUTHORIZED_NO_AUTH_HEADER') {
    return isAdmin
      ? 'Supabase gateway rejected the request (missing Authorization). Redeploy from this repo so patreon-oauth-start/config.toml (verify_jwt = false) is applied, set VITE_SUPABASE_ANON_KEY on your host, and use Settings → Connect Patreon — never open the function URL in the browser.'
      : 'Patreon connection is not available yet. Ask an admin to redeploy Edge Functions and retry Connect Patreon in Settings.';
  }
  return body?.message ?? body?.error ?? 'Session expired. Sign out and sign in again, then retry Connect Patreon.';
}

async function parsePatreonOAuthConfigError(
  res: Response,
): Promise<{ missingSecrets?: string[]; serverError?: string }> {
  try {
    const body = (await res.json()) as PatreonOAuthConfigErrorBody;
    const missing =
      Array.isArray(body.missing_secrets) && body.missing_secrets.length > 0
        ? body.missing_secrets
        : undefined;
    return { missingSecrets: missing, serverError: body.error };
  } catch {
    return {};
  }
}

function formatMissingPatreonSecrets(missingSecrets: string[]): string {
  return missingSecrets.join(', ');
}

/** Check whether patreon-oauth-start is deployed and secrets are set. */
export async function probePatreonOAuthStart(): Promise<PatreonOAuthProbeResult> {
  const probeUrl = getPatreonOAuthProbeUrl();
  if (!probeUrl) return { status: 'no_supabase' };

  try {
    const res = await fetch(probeUrl, {
      method: 'GET',
      headers: {
        ...supabaseFunctionHeaders(),
        Accept: 'application/json',
      },
    });
    if (res.status === 404) return { status: 'not_deployed' };
    if (res.status === 401) {
      return {
        status: 'unknown',
        serverError:
          'Gateway returned 401 (JWT required). Redeploy patreon-oauth-start with verify_jwt = false in supabase/functions/patreon-oauth-start/config.toml, then redeploy all three Patreon functions.',
      };
    }

    let body: PatreonOAuthProbeBody = {};
    try {
      body = (await res.json()) as PatreonOAuthProbeBody;
    } catch {
      if (res.status === 503) {
        return {
          status: 'unknown',
          serverError:
            'Patreon OAuth start returned 503 without a probe JSON body. Redeploy patreon-oauth-start (latest code uses ?probe=1).',
        };
      }
      if (!res.ok) return { status: 'unknown' };
      return { status: 'ready' };
    }

    const missing = parseMissingSecretNames(body);
    if (body.ok === true) return { status: 'ready' };
    if (body.ok === false && missing.length > 0) {
      return { status: 'server_not_configured', missingSecrets: missing };
    }

    if (res.status === 503) {
      if (missing.length > 0) {
        return { status: 'server_not_configured', missingSecrets: missing };
      }
      const err = typeof body.error === 'string' ? body.error : undefined;
      return {
        status: 'unknown',
        serverError:
          err ??
          'Patreon OAuth start returned 503 without listing missing secrets. Check Edge Function logs and redeploy.',
      };
    }

    if (!res.ok) return { status: 'unknown' };
    return { status: 'ready' };
  } catch {
    return { status: 'unknown' };
  }
}

export function patreonOAuthStatusMessageFromProbe(
  probe: PatreonOAuthProbeResult,
  isAdmin = false,
): string | null {
  return patreonOAuthStatusMessage(
    probe.status,
    isAdmin,
    probe.missingSecrets,
    probe.serverError,
  );
}

export function patreonOAuthStatusMessage(
  status: PatreonOAuthProbeStatus,
  isAdmin = false,
  missingSecrets?: string[],
  serverError?: string,
): string | null {
  switch (status) {
    case 'not_deployed':
      return isAdmin
        ? 'Patreon OAuth Edge Functions are not deployed. Install the Supabase CLI, link your project, and run: supabase functions deploy patreon-oauth-start patreon-oauth-callback patreon-webhook (see README).'
        : 'Patreon connection is not available yet. Ask an admin to deploy Supabase Edge Functions first.';
    case 'server_not_configured':
      if (isAdmin && missingSecrets?.length) {
        return `Edge Functions are deployed but Patreon secret(s) are missing: ${formatMissingPatreonSecrets(missingSecrets)}. Add them in Supabase Dashboard → Edge Functions → Secrets (names are case-sensitive), then redeploy: supabase functions deploy patreon-oauth-start patreon-oauth-callback patreon-webhook. PATREON_CLIENT_SECRET is only required for the callback, not oauth-start.`;
      }
      if (isAdmin && serverError) return serverError;
      return isAdmin
        ? 'Edge Functions are deployed but Patreon OAuth is not configured. Set PATREON_CLIENT_ID (required) and optionally PATREON_REDIRECT_URI in Supabase Dashboard → Edge Functions → Secrets, then redeploy the Patreon functions. If PATREON_REDIRECT_URI is omitted, hosted Supabase uses SUPABASE_URL/functions/v1/patreon-oauth-callback automatically.'
        : 'Patreon OAuth is not fully configured on the server yet. Try again later or ask an admin.';
    case 'no_supabase':
      return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.';
    case 'unknown':
      if (isAdmin && serverError) return serverError;
      return isAdmin
        ? 'Could not verify Patreon OAuth. Confirm VITE_SUPABASE_URL matches your Supabase project ref, deploy all three Patreon functions, and retry Connect Patreon from Settings.'
        : null;
    default:
      return null;
  }
}

/** Probe, then fetch OAuth start with auth and redirect to Patreon. */
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
  const blockMessage = patreonOAuthStatusMessageFromProbe(probe, options?.isAdmin);
  if (blockMessage) {
    return { ok: false, message: blockMessage };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      message:
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.',
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, message: 'You must be signed in to connect Patreon.' };
  }

  const anonKey = getAnonKey();
  if (!anonKey) {
    return {
      ok: false,
      message:
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.',
    };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: anonKey,
  };

  try {
    const res = await fetch(startUrl, {
      method: 'GET',
      redirect: 'manual',
      headers,
    });

    const redirectLocation = oauthRedirectFromResponse(res);
    if (redirectLocation) {
      window.location.assign(redirectLocation);
      return { ok: true };
    }

    if (res.status === 401) {
      let errBody: PatreonOAuthStartBody | null = null;
      try {
        errBody = (await res.json()) as PatreonOAuthStartBody;
      } catch {
        /* ignore */
      }
      const message = messageForGatewayAuthFailure(errBody, options?.isAdmin);
      console.error('[connectPatreon]', message, errBody?.code ?? res.status);
      return { ok: false, message };
    }

    if (res.status === 503) {
      const details = await parsePatreonOAuthConfigError(res);
      if (details.missingSecrets?.length) {
        const msg = patreonOAuthStatusMessage(
          'server_not_configured',
          options?.isAdmin,
          details.missingSecrets,
          details.serverError,
        );
        const message = msg ?? 'Patreon OAuth is not configured on the server.';
        console.error('[connectPatreon]', message);
        return { ok: false, message };
      }
      const message =
        details.serverError ??
        `Patreon OAuth start failed (${res.status}). Check Edge Function logs and redeploy.`;
      console.error('[connectPatreon]', message);
      return { ok: false, message };
    }

    if (!res.ok) {
      let detail = `Patreon OAuth start failed (${res.status}).`;
      try {
        const errBody = (await res.json()) as PatreonOAuthStartBody;
        detail = errBody.error ?? errBody.message ?? detail;
        if (errBody.code === 'UNAUTHORIZED_NO_AUTH_HEADER') {
          detail = messageForGatewayAuthFailure(errBody, options?.isAdmin);
        }
      } catch {
        /* ignore */
      }
      console.error('[connectPatreon]', detail);
      return { ok: false, message: detail };
    }

    let body: PatreonOAuthStartBody = {};
    try {
      body = (await res.json()) as PatreonOAuthStartBody;
    } catch {
      const message = 'Patreon OAuth start returned an invalid response. Redeploy patreon-oauth-start.';
      console.error('[connectPatreon]', message);
      return { ok: false, message };
    }

    const redirectUrl = parseOAuthStartRedirect(body);
    if (redirectUrl) {
      window.location.assign(redirectUrl);
      return { ok: true };
    }

    const message = body.error ?? body.message ?? 'Could not start Patreon OAuth.';
    console.error('[connectPatreon]', message);
    return { ok: false, message };
  } catch (err) {
    const message = 'Could not reach Patreon OAuth. Check your connection and try again.';
    console.error('[connectPatreon]', message, err);
    return { ok: false, message };
  }
}
