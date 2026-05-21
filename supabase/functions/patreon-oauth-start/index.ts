import { corsHeaders, getPatreonOAuthStartConfig } from '../_shared/patreon.ts';

const PATREON_AUTH_URL = 'https://www.patreon.com/oauth2/authorize';

function notConfiguredResponse(
  missingSecrets: string[],
  wantsJson: boolean,
  appOrigin: string,
): Response {
  const missingList = missingSecrets.join(', ');
  const error = missingSecrets.length
    ? `Patreon OAuth is not configured. Missing Edge Function secret(s): ${missingList}.`
    : 'Patreon OAuth is not configured.';
  if (!wantsJson) {
    return Response.redirect(`${appOrigin}/settings?patreon=not_configured`, 302);
  }
  return new Response(JSON.stringify({ error, missing_secrets: missingSecrets }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const { clientId, redirectUri, missingSecrets } = getPatreonOAuthStartConfig();
  const appOrigin = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173';
  const wantsJson = req.headers.get('accept')?.includes('application/json');

  if (url.searchParams.get('probe') === '1') {
    return new Response(
      JSON.stringify({ ok: missingSecrets.length === 0, missing: missingSecrets }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  if (missingSecrets.length > 0) {
    return notConfiguredResponse(missingSecrets, wantsJson, appOrigin);
  }

  const userId = url.searchParams.get('user_id');
  const returnTo = url.searchParams.get('return_to') ?? '/settings';

  if (!userId) {
    if (!wantsJson) {
      return Response.redirect(`${appOrigin}/settings?patreon=error`, 302);
    }
    return new Response(JSON.stringify({ error: 'user_id query parameter is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const state = btoa(JSON.stringify({ userId, returnTo }));

  const authUrl = new URL(PATREON_AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'identity identity[email] campaigns members');
  authUrl.searchParams.set('state', state);

  if (wantsJson) {
    return new Response(JSON.stringify({ redirectUrl: authUrl.toString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return Response.redirect(authUrl.toString(), 302);
});
