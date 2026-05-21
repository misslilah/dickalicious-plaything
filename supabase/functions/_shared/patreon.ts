/** Map Patreon reward / tier titles to app tiers (case-insensitive substring match). */
export type AppPatreonTier = 'sweetie' | 'princess' | 'slut';

export function mapPatreonTierTitle(title: string): AppPatreonTier | null {
  const t = title.toLowerCase();
  if (t.includes('slut')) return 'slut';
  if (t.includes('princess')) return 'princess';
  if (t.includes('sweetie')) return 'sweetie';
  return null;
}

export function highestTier(tiers: AppPatreonTier[]): AppPatreonTier | null {
  const order: AppPatreonTier[] = ['sweetie', 'princess', 'slut'];
  let best: AppPatreonTier | null = null;
  let bestRank = -1;
  for (const tier of tiers) {
    const rank = order.indexOf(tier);
    if (rank > bestRank) {
      bestRank = rank;
      best = tier;
    }
  }
  return best;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Patreon API v2 OAuth scopes for /identity + memberships (space-separated). */
export const PATREON_OAUTH_SCOPES =
  'identity identity[email] identity.memberships';

/** Redirect browser to Settings after Patreon OAuth errors (never gateway JSON). */
export function patreonSettingsErrorRedirect(
  appOrigin: string,
  detail?: string,
): Response {
  const target = new URL('/settings', appOrigin);
  target.searchParams.set('patreon', 'error');
  if (detail) {
    const safe = detail.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (safe) target.searchParams.set('detail', safe);
  }
  return Response.redirect(target.toString(), 302);
}

/** Resolve Patreon OAuth start env; lists missing secret names for 503 responses. */
export function getPatreonOAuthStartConfig(): {
  clientId: string;
  redirectUri: string;
  missingSecrets: string[];
} {
  const clientId = Deno.env.get('PATREON_CLIENT_ID')?.trim() ?? '';
  const redirectOverride = Deno.env.get('PATREON_REDIRECT_URI')?.trim() ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '') ?? '';
  const defaultRedirect = supabaseUrl
    ? `${supabaseUrl}/functions/v1/patreon-oauth-callback`
    : '';
  const redirectUri = redirectOverride || defaultRedirect;
  const missingSecrets: string[] = [];
  if (!clientId) missingSecrets.push('PATREON_CLIENT_ID');
  if (!redirectUri) missingSecrets.push('PATREON_REDIRECT_URI');
  return { clientId, redirectUri, missingSecrets };
}

/** Resolve Patreon OAuth callback env; lists missing secret names. */
export function getPatreonOAuthCallbackConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  missingSecrets: string[];
} {
  const clientId = Deno.env.get('PATREON_CLIENT_ID')?.trim() ?? '';
  const clientSecret = Deno.env.get('PATREON_CLIENT_SECRET')?.trim() ?? '';
  const redirectOverride = Deno.env.get('PATREON_REDIRECT_URI')?.trim() ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '') ?? '';
  const defaultRedirect = supabaseUrl
    ? `${supabaseUrl}/functions/v1/patreon-oauth-callback`
    : '';
  const redirectUri = redirectOverride || defaultRedirect;
  const missingSecrets: string[] = [];
  if (!clientId) missingSecrets.push('PATREON_CLIENT_ID');
  if (!clientSecret) missingSecrets.push('PATREON_CLIENT_SECRET');
  if (!redirectUri) missingSecrets.push('PATREON_REDIRECT_URI');
  return { clientId, clientSecret, redirectUri, missingSecrets };
}
