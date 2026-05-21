import { corsHeaders, getPatreonOAuthStartConfig } from '../_shared/patreon.ts';

const PATREON_AUTH_URL = 'https://www.patreon.com/oauth2/authorize';

function notConfiguredResponse(missingSecrets: string[]): Response {
  const missingList = missingSecrets.join(', ');
  const error = missingSecrets.length
    ? `Patreon OAuth is not configured. Missing Edge Function secret(s): ${missingList}.`
    : 'Patreon OAuth is not configured.';
  return new Response(JSON.stringify({ error, missing_secrets: missingSecrets }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const { clientId, redirectUri, missingSecrets } = getPatreonOAuthStartConfig();

  if (missingSecrets.length > 0) {
    return notConfiguredResponse(missingSecrets);
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');
  const returnTo = url.searchParams.get('return_to') ?? '/settings';

  if (!userId) {
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

  const wantsJson = req.headers.get('accept')?.includes('application/json');
  if (wantsJson) {
    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return Response.redirect(authUrl.toString(), 302);
});
