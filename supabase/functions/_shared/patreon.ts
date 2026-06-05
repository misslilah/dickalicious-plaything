/** Map Patreon reward / tier IDs or exact titles to app tiers. */
export type AppPatreonTier = 'sweetie' | 'princess' | 'slut';

const APP_TIER_ORDER: AppPatreonTier[] = ['sweetie', 'princess', 'slut'];

const EXACT_TIER_TITLES: Record<string, AppPatreonTier> = {
  sweetie: 'sweetie',
  princess: 'princess',
  slut: 'slut',
};

let cachedRewardIdMap: Map<string, AppPatreonTier> | null = null;

/** Reward/tier ID → app tier from env (preferred over title matching). */
export function getPatreonTierRewardIdMap(): Map<string, AppPatreonTier> {
  if (cachedRewardIdMap) return cachedRewardIdMap;

  const idToTier = new Map<string, AppPatreonTier>();
  const jsonRaw = Deno.env.get('PATREON_TIER_REWARD_IDS')?.trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as Record<string, string>;
      for (const tier of APP_TIER_ORDER) {
        const id = parsed[tier]?.trim();
        if (id) idToTier.set(id, tier);
      }
    } catch {
      console.warn('PATREON_TIER_REWARD_IDS is not valid JSON — ignoring.');
    }
  }

  for (const tier of APP_TIER_ORDER) {
    const id = Deno.env.get(`PATREON_TIER_REWARD_ID_${tier.toUpperCase()}`)?.trim();
    if (id) idToTier.set(id, tier);
  }

  cachedRewardIdMap = idToTier;
  return idToTier;
}

export function mapPatreonTierByRewardId(rewardId: string): AppPatreonTier | null {
  return getPatreonTierRewardIdMap().get(rewardId) ?? null;
}

/** Exact title match only (trimmed, case-insensitive). No substring matching. */
export function mapPatreonTierTitle(title: string): AppPatreonTier | null {
  const normalized = title.trim().toLowerCase();
  return EXACT_TIER_TITLES[normalized] ?? null;
}

/** Prefer configured reward ID mapping; fall back to exact title match. */
export function mapPatreonTier(rewardId: string | undefined, title: string): AppPatreonTier | null {
  if (rewardId) {
    const byId = mapPatreonTierByRewardId(rewardId);
    if (byId) return byId;
  }
  return mapPatreonTierTitle(title);
}

export function highestTier(tiers: AppPatreonTier[]): AppPatreonTier | null {
  let best: AppPatreonTier | null = null;
  let bestRank = -1;
  for (const tier of tiers) {
    const rank = APP_TIER_ORDER.indexOf(tier);
    if (rank > bestRank) {
      bestRank = rank;
      best = tier;
    }
  }
  return best;
}

export function logPatreonTierDebug(context: string, details: Record<string, unknown>): void {
  if (Deno.env.get('PATREON_TIER_DEBUG') === '1') {
    console.log(`[patreon-tier-debug] ${context}`, JSON.stringify(details));
  }
}

export function getPatreonCreatorCampaignId(): string | null {
  return Deno.env.get('PATREON_CREATOR_CAMPAIGN_ID')?.trim() || null;
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

export type PatreonIncludedResource = {
  type: string;
  id?: string;
  attributes?: {
    title?: string;
    patron_status?: PatreonPatronStatus | null;
    [key: string]: unknown;
  };
  relationships?: {
    campaign?: { data?: { id?: string } | null };
    currently_entitled_tiers?: {
      data?: { id: string; type: string }[] | { id: string; type: string } | null;
    };
    [key: string]: unknown;
  };
};

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

function normalizeEntitledTierRefs(
  entitledRaw:
    | { id: string; type: string }[]
    | { id: string; type: string }
    | null
    | undefined,
): { id: string; type: string }[] {
  if (Array.isArray(entitledRaw)) return entitledRaw.filter((r) => r.id);
  if (entitledRaw?.id) return [entitledRaw];
  return [];
}

function entitledTierResourcesFromIds(
  included: PatreonIncludedResource[],
  entitledIds: Set<string>,
): { id: string; title: string }[] {
  return included
    .filter(
      (x) =>
        (x.type === 'tier' || x.type === 'reward') &&
        x.id &&
        entitledIds.has(x.id) &&
        x.attributes?.title,
    )
    .map((x) => ({ id: x.id!, title: x.attributes!.title! }));
}

function mapEntitledResources(resources: { id: string; title: string }[]): AppPatreonTier[] {
  return resources
    .map(({ id, title }) => mapPatreonTier(id, title))
    .filter((t): t is AppPatreonTier => t != null);
}

/** Tier id/title pairs linked by currently_entitled_tiers only (no fallback to all campaign tiers). */
export function extractEntitledTierResources(
  payload: PatreonWebhookPayload,
): { id: string; title: string }[] {
  const included = (payload.included ?? []) as PatreonIncludedResource[];
  const entitledRefs = normalizeEntitledTierRefs(
    payload.data?.relationships?.currently_entitled_tiers?.data,
  );
  const entitledIds = new Set(entitledRefs.map((r) => r.id).filter(Boolean));
  if (entitledIds.size === 0) return [];
  return entitledTierResourcesFromIds(included, entitledIds);
}

/** @deprecated Use extractEntitledTierResources — titles only, entitled tiers only. */
export function extractEntitledTierTitles(payload: PatreonWebhookPayload): string[] {
  return extractEntitledTierResources(payload).map((r) => r.title);
}

export function resolveAppTierFromIncludedMembers(
  included: PatreonIncludedResource[],
  options?: { campaignId?: string | null },
): {
  appTier: AppPatreonTier | null;
  patronStatus: 'active' | 'cancelled' | 'none';
  debug: Record<string, unknown>;
} {
  const campaignId = options?.campaignId ?? getPatreonCreatorCampaignId();
  const members = included.filter((x) => x.type === 'member');
  const relevantMembers = campaignId
    ? members.filter((m) => m.relationships?.campaign?.data?.id === campaignId)
    : members;

  const mappedTiers: AppPatreonTier[] = [];
  const memberDebug: Record<string, unknown>[] = [];

  for (const member of relevantMembers) {
    const patronStatus = member.attributes?.patron_status ?? null;
    const entitledRefs = normalizeEntitledTierRefs(
      member.relationships?.currently_entitled_tiers?.data,
    );
    const entitledIds = new Set(entitledRefs.map((r) => r.id));
    const resources = entitledTierResourcesFromIds(included, entitledIds);
    const memberMapped = mapEntitledResources(resources);

    memberDebug.push({
      memberId: member.id ?? null,
      campaignId: member.relationships?.campaign?.data?.id ?? null,
      patronStatus,
      entitledTierIds: [...entitledIds],
      entitledTitles: resources.map((r) => r.title),
      mappedTiers: memberMapped,
    });

    if (patronStatus !== 'active_patron') continue;
    mappedTiers.push(...memberMapped);
  }

  const appTier = highestTier(mappedTiers);
  const hasActiveMember = relevantMembers.some(
    (m) => m.attributes?.patron_status === 'active_patron',
  );
  const patronStatus: 'active' | 'cancelled' | 'none' =
    hasActiveMember && appTier ? 'active' : hasActiveMember ? 'none' : 'cancelled';

  return {
    appTier: hasActiveMember ? appTier : null,
    patronStatus,
    debug: {
      campaignFilter: campaignId,
      memberCount: relevantMembers.length,
      members: memberDebug,
      resolvedTier: appTier,
      resolvedStatus: patronStatus,
      rewardIdMapConfigured: getPatreonTierRewardIdMap().size > 0,
    },
  };
}

/** Resolve tier from Patreon /identity JSON (OAuth callback). */
export function resolveAppTierFromIdentityResponse(identity: {
  included?: PatreonIncludedResource[];
}): {
  appTier: AppPatreonTier | null;
  patronStatus: 'active' | 'cancelled' | 'none';
  debug: Record<string, unknown>;
} {
  const included = identity.included ?? [];
  return resolveAppTierFromIncludedMembers(included);
}

export function appTierFromWebhookPayload(payload: PatreonWebhookPayload): AppPatreonTier | null {
  return highestTier(mapEntitledResources(extractEntitledTierResources(payload)));
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
