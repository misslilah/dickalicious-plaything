import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  getPatreonOAuthCallbackConfig,
  logPatreonTierDebug,
  patreonSettingsErrorRedirect,
  resolveAppTierFromIdentityResponse,
} from '../_shared/patreon.ts';

const PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';
const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';

Deno.serve(async (req) => {
  const appOrigin = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173';
  const url = new URL(req.url);

  // Patreon OAuth redirect: GET with ?code= or ?error= (no Authorization header).
  if (req.method === 'GET') {
    const oauthError = url.searchParams.get('error');
    if (oauthError) {
      return patreonSettingsErrorRedirect(appOrigin, oauthError);
    }
    const code = url.searchParams.get('code');
    if (code && !url.searchParams.get('state')) {
      return patreonSettingsErrorRedirect(appOrigin, 'missing_params');
    }
    if (!code && !oauthError) {
      return patreonSettingsErrorRedirect(appOrigin, 'missing_params');
    }
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');

  if (!code || !stateRaw) {
    return patreonSettingsErrorRedirect(appOrigin, 'missing_params');
  }

  let state: { userId: string; returnTo: string };
  try {
    state = JSON.parse(atob(stateRaw));
  } catch {
    return patreonSettingsErrorRedirect(appOrigin, 'invalid_state');
  }

  const { clientId, clientSecret, redirectUri, missingSecrets } =
    getPatreonOAuthCallbackConfig();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';

  if (missingSecrets.length > 0 || !supabaseUrl || !serviceKey) {
    return Response.redirect(`${appOrigin}/settings?patreon=not_configured`, 302);
  }

  const tokenRes = await fetch(PATREON_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    console.error('Patreon token exchange failed', await tokenRes.text());
    return Response.redirect(`${appOrigin}/settings?patreon=token_error`, 302);
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;

  const identityRes = await fetch(
    `${PATREON_API}/identity?include=memberships,memberships.currently_entitled_tiers&fields[user]=email&fields[tier]=title&fields[member]=patron_status`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!identityRes.ok) {
    console.error('Patreon identity failed', await identityRes.text());
    return Response.redirect(`${appOrigin}/settings?patreon=identity_error`, 302);
  }

  const identity = await identityRes.json();
  const patreonUserId = identity?.data?.id as string | undefined;

  const { appTier, patronStatus: patreonStatus, debug } =
    resolveAppTierFromIdentityResponse(identity);
  logPatreonTierDebug('oauth-callback', {
    userId: state.userId,
    patreonUserId: patreonUserId ?? null,
    ...debug,
  });

  const supabase = createClient(supabaseUrl, serviceKey);

  await supabase
    .from('profiles')
    .update({
      patreon_user_id: patreonUserId ?? null,
      patreon_tier: appTier,
      patreon_status: patreonStatus,
      patreon_updated_at: new Date().toISOString(),
    })
    .eq('id', state.userId);

  const returnPath = state.returnTo?.startsWith('/') ? state.returnTo : '/settings';
  return Response.redirect(`${appOrigin}${returnPath}?patreon=connected`, 302);
});
