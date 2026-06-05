import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildPatreonIdentityUrl,
  corsHeaders,
  getPatreonOAuthCallbackConfig,
  logPatreonTierResolution,
  patreonOAuthNoTierDetail,
  patreonSettingsErrorRedirect,
  patreonSettingsOAuthResultRedirect,
  resolveAppTierFromIdentityResponse,
  selfTestResolveAppTierFromIdentity,
} from '../_shared/patreon.ts';

const PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';

Deno.serve(async (req) => {
  const appOrigin = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173';
  const url = new URL(req.url);

  if (Deno.env.get('PATREON_TIER_SELF_TEST') === '1') {
    const result = selfTestResolveAppTierFromIdentity();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

  if (!state.userId?.trim()) {
    console.error('[patreon-oauth-callback] missing userId in state', state);
    return patreonSettingsErrorRedirect(appOrigin, 'missing_user_id');
  }

  const { clientId, clientSecret, redirectUri, missingSecrets } =
    getPatreonOAuthCallbackConfig();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';

  if (missingSecrets.length > 0 || !supabaseUrl || !serviceKey) {
    return patreonSettingsErrorRedirect(appOrigin, 'not_configured', 'not_configured');
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
    const tokenBody = await tokenRes.text();
    console.error('[patreon-oauth-callback] token exchange failed', tokenRes.status, tokenBody);
    return patreonSettingsErrorRedirect(appOrigin, 'token_error', 'token_error');
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string;
  if (!accessToken) {
    console.error('[patreon-oauth-callback] token response missing access_token', tokenJson);
    return patreonSettingsErrorRedirect(appOrigin, 'token_missing', 'token_error');
  }

  const identityUrl = buildPatreonIdentityUrl();
  const identityRes = await fetch(identityUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!identityRes.ok) {
    const identityBody = await identityRes.text();
    console.error(
      '[patreon-oauth-callback] identity failed',
      identityRes.status,
      identityUrl,
      identityBody,
    );
    return patreonSettingsErrorRedirect(appOrigin, 'identity_error', 'identity_error');
  }

  const identity = await identityRes.json();
  const patreonUserId = identity?.data?.id as string | undefined;

  const { appTier, patronStatus: patreonStatus, debug } =
    await resolveAppTierFromIdentityResponse(identity, accessToken);

  logPatreonTierResolution('oauth-callback', {
    userId: state.userId,
    patreonUserId: patreonUserId ?? null,
    appTier,
    patreonStatus,
    identityUrl,
    ...debug,
  });

  const supabase = createClient(supabaseUrl, serviceKey);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      patreon_user_id: patreonUserId ?? null,
      patreon_tier: appTier,
      patreon_status: patreonStatus,
      patreon_updated_at: new Date().toISOString(),
    })
    .eq('id', state.userId);

  const returnPath = state.returnTo?.startsWith('/') ? state.returnTo : '/settings';

  if (profileError) {
    console.error('[patreon-oauth-callback] profile update failed', {
      userId: state.userId,
      error: profileError,
    });
    return patreonSettingsErrorRedirect(appOrigin, 'profile_update_failed', 'profile_update_error');
  }

  if (!appTier) {
    const noTierDetail = patreonOAuthNoTierDetail(debug);
    console.warn('[patreon-oauth-callback] linked but no tier', {
      userId: state.userId,
      patreonUserId,
      detail: noTierDetail,
      ...debug,
    });
    return patreonSettingsOAuthResultRedirect(appOrigin, returnPath, 'no_tier', noTierDetail);
  }

  return patreonSettingsOAuthResultRedirect(appOrigin, returnPath, 'connected');
});
