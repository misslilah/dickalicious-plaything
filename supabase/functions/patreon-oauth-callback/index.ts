import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  highestTier,
  mapPatreonTierTitle,
  type AppPatreonTier,
} from '../_shared/patreon.ts';

const PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';
const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const appOrigin = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173';

  if (oauthError) {
    return Response.redirect(`${appOrigin}/settings?patreon=error`, 302);
  }

  if (!code || !stateRaw) {
    return new Response('Missing code or state.', { status: 400, headers: corsHeaders });
  }

  let state: { userId: string; returnTo: string };
  try {
    state = JSON.parse(atob(stateRaw));
  } catch {
    return new Response('Invalid state.', { status: 400, headers: corsHeaders });
  }

  const clientId = Deno.env.get('PATREON_CLIENT_ID');
  const clientSecret = Deno.env.get('PATREON_CLIENT_SECRET');
  const redirectUri = Deno.env.get('PATREON_REDIRECT_URI');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !serviceKey) {
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
    `${PATREON_API}/identity?include=memberships,memberships.currently_entitled_tiers&fields[user]=email&fields[tier]=title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!identityRes.ok) {
    console.error('Patreon identity failed', await identityRes.text());
    return Response.redirect(`${appOrigin}/settings?patreon=identity_error`, 302);
  }

  const identity = await identityRes.json();
  const patreonUserId = identity?.data?.id as string | undefined;

  const included = (identity?.included ?? []) as { type: string; id: string; attributes?: { title?: string } }[];
  const tierTitles = included
    .filter((x) => x.type === 'tier')
    .map((x) => x.attributes?.title ?? '')
    .filter(Boolean);

  const mapped = tierTitles
    .map(mapPatreonTierTitle)
    .filter((t): t is AppPatreonTier => t != null);

  const appTier = highestTier(mapped);
  const patreonStatus = appTier ? 'active' : 'none';

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
