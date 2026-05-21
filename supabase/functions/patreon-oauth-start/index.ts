import { corsHeaders } from '../_shared/patreon.ts';

const PATREON_AUTH_URL = 'https://www.patreon.com/oauth2/authorize';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clientId = Deno.env.get('PATREON_CLIENT_ID');
  const redirectUri = Deno.env.get('PATREON_REDIRECT_URI');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  if (!clientId || !redirectUri) {
    return new Response(
      JSON.stringify({
        error: 'Patreon OAuth is not configured. Set PATREON_CLIENT_ID and PATREON_REDIRECT_URI in Edge Function secrets.',
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
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

  const callback =
    redirectUri ||
    (supabaseUrl
      ? `${supabaseUrl}/functions/v1/patreon-oauth-callback`
      : '');

  const authUrl = new URL(PATREON_AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callback);
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
