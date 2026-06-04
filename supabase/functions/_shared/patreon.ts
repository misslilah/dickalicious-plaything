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

/** Patreon v2 member webhook triggers handled by patreon-webhook (docs.patreon.com). */
export const PATREON_WEBHOOK_MEMBER_EVENTS = [
  'members:create',
  'members:update',
  'members:delete',
  'members:pledge:create',
  'members:pledge:update',
  'members:pledge:delete',
] as const;

export type PatreonWebhookMemberEvent = (typeof PATREON_WEBHOOK_MEMBER_EVENTS)[number];

export type PatreonPatronStatus = 'active_patron' | 'declined_patron' | 'former_patron';

/** Patreon v2 webhook POST body (member resource in data; event name in X-Patreon-Event). */
export interface PatreonWebhookPayload {
  data?: {
    type?: string;
    attributes?: {
      patron_status?: PatreonPatronStatus | null;
      [key: string]: unknown;
    };
    relationships?: {
      user?: { data?: { id?: string } | null };
      currently_entitled_tiers?: {
        data?: { id: string; type: string }[] | { id: string; type: string } | null;
      };
      [key: string]: unknown;
    };
  };
  included?: { type: string; id?: string; attributes?: { title?: string } }[];
}

export function isPatreonWebhookMemberEvent(event: string): event is PatreonWebhookMemberEvent {
  return (PATREON_WEBHOOK_MEMBER_EVENTS as readonly string[]).includes(event);
}

export function extractPatreonUserId(payload: PatreonWebhookPayload): string | null {
  const userId = payload.data?.relationships?.user?.data?.id;
  if (userId) return String(userId);
  const userInc = (payload.included ?? []).find((x) => x.type === 'user');
  return userInc?.id ?? null;
}

export function extractPatronStatus(payload: PatreonWebhookPayload): PatreonPatronStatus | null {
  const status = payload.data?.attributes?.patron_status;
  if (status === 'active_patron' || status === 'declined_patron' || status === 'former_patron') {
    return status;
  }
  return null;
}

/** Tier titles from included resources linked by currently_entitled_tiers, else all tier/reward includes. */
export function extractEntitledTierTitles(payload: PatreonWebhookPayload): string[] {
  const included = payload.included ?? [];
  const entitledRaw = payload.data?.relationships?.currently_entitled_tiers?.data;
  const entitledRefs = Array.isArray(entitledRaw)
    ? entitledRaw
    : entitledRaw
      ? [entitledRaw]
      : [];
  const entitledIds = new Set(entitledRefs.map((r) => r.id).filter(Boolean));

  if (entitledIds.size > 0) {
    const linked = included
      .filter(
        (x) =>
          (x.type === 'tier' || x.type === 'reward') &&
          x.id &&
          entitledIds.has(x.id) &&
          x.attributes?.title,
      )
      .map((x) => x.attributes!.title!);
    if (linked.length > 0) return linked;
  }

  return included
    .filter((x) => x.type === 'tier' || x.type === 'reward')
    .map((x) => x.attributes?.title ?? '')
    .filter(Boolean);
}

export function appTierFromWebhookPayload(payload: PatreonWebhookPayload): AppPatreonTier | null {
  const mapped = extractEntitledTierTitles(payload)
    .map(mapPatreonTierTitle)
    .filter((t): t is AppPatreonTier => t != null);
  return highestTier(mapped);
}

/** Profile patch from webhook event + member payload (matches oauth tier mapping). */
export function resolveWebhookProfileUpdate(
  event: string,
  payload: PatreonWebhookPayload,
): { appTier: AppPatreonTier | null; patreonStatus: 'active' | 'cancelled' } | null {
  if (!isPatreonWebhookMemberEvent(event)) return null;

  if (event === 'members:pledge:delete' || event === 'members:delete') {
    return { appTier: null, patreonStatus: 'cancelled' };
  }

  const patronStatus = extractPatronStatus(payload);
  const appTier = appTierFromWebhookPayload(payload);

  if (patronStatus === 'active_patron' && appTier) {
    return { appTier, patreonStatus: 'active' };
  }

  return { appTier: null, patreonStatus: 'cancelled' };
}
