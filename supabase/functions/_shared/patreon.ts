/** Map Patreon reward / tier IDs or exact titles to app tiers. */
export type AppPatreonTier = 'sweetie' | 'princess' | 'slut';

const APP_TIER_ORDER: AppPatreonTier[] = ['sweetie', 'princess', 'slut'];

const EXACT_TIER_TITLES: Record<string, AppPatreonTier> = {
  sweetie: 'sweetie',
  princess: 'princess',
  slut: 'slut',
};

let cachedRewardIdMap: Map<string, AppPatreonTier> | null = null;

/** Normalize Patreon API / env IDs (string or number) for consistent comparison. */
function normalizePatreonId(id: unknown): string | null {
  if (id == null) return null;
  if (typeof id === 'number' && Number.isFinite(id)) return String(Math.trunc(id));
  if (typeof id === 'string') {
    const trimmed = id.trim();
    return trimmed || null;
  }
  return null;
}

function parsePatreonTierRewardIdsJson(jsonRaw: string): Record<string, unknown> | null {
  const trimmed = jsonRaw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const unwrapped =
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
        ? trimmed.slice(1, -1).trim()
        : null;
    if (!unwrapped) return null;
    try {
      return JSON.parse(unwrapped) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/** Reward/tier ID → app tier from env (preferred over title matching). */
export function getPatreonTierRewardIdMap(): Map<string, AppPatreonTier> {
  if (cachedRewardIdMap) return cachedRewardIdMap;

  const idToTier = new Map<string, AppPatreonTier>();
  const jsonRaw = Deno.env.get('PATREON_TIER_REWARD_IDS')?.trim();
  if (jsonRaw) {
    const parsed = parsePatreonTierRewardIdsJson(jsonRaw);
    if (parsed) {
      for (const tier of APP_TIER_ORDER) {
        const id = normalizePatreonId(parsed[tier]);
        if (id) idToTier.set(id, tier);
      }
    } else {
      console.warn('PATREON_TIER_REWARD_IDS is not valid JSON — ignoring.');
    }
  }

  for (const tier of APP_TIER_ORDER) {
    const id = normalizePatreonId(
      Deno.env.get(`PATREON_TIER_REWARD_ID_${tier.toUpperCase()}`),
    );
    if (id) idToTier.set(id, tier);
  }

  cachedRewardIdMap = idToTier;
  return idToTier;
}

export function mapPatreonTierByRewardId(rewardId: string): AppPatreonTier | null {
  const normalized = normalizePatreonId(rewardId);
  if (!normalized) return null;
  return getPatreonTierRewardIdMap().get(normalized) ?? null;
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

const PATREON_API_V2 = 'https://www.patreon.com/api/oauth2/v2';

/**
 * Patreon v2 /identity query — nested includes per docs.patreon.com.
 * Top-level `memberships` sideloads member resources; nested paths add tiers + campaign.
 */
export const PATREON_IDENTITY_INCLUDES =
  'memberships,memberships.currently_entitled_tiers,memberships.campaign';

export const PATREON_MEMBER_INCLUDES = 'currently_entitled_tiers,campaign';

export function buildPatreonIdentityUrl(): string {
  const params = new URLSearchParams({
    include: PATREON_IDENTITY_INCLUDES,
    'fields[user]': 'email',
    'fields[member]': 'patron_status',
    'fields[tier]': 'title',
  });
  return `${PATREON_API_V2}/identity?${params.toString()}`;
}

export function buildPatreonMemberUrl(memberId: string): string {
  const params = new URLSearchParams({
    include: PATREON_MEMBER_INCLUDES,
    'fields[member]': 'patron_status',
    'fields[tier]': 'title',
  });
  return `${PATREON_API_V2}/members/${encodeURIComponent(memberId)}?${params.toString()}`;
}

function normalizeJsonApiRefs(
  raw: PatreonJsonApiRef[] | PatreonJsonApiRef | null | undefined,
): PatreonJsonApiRef[] {
  const refs = Array.isArray(raw) ? raw : raw?.id ? [raw] : [];
  return refs
    .map((ref) => {
      const id = normalizePatreonId(ref.id);
      return id ? { id, type: ref.type } : null;
    })
    .filter((ref): ref is PatreonJsonApiRef => ref != null);
}

function countIncludedTypes(included: PatreonIncludedResource[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const resource of included) {
    counts[resource.type] = (counts[resource.type] ?? 0) + 1;
  }
  return counts;
}

function extractMembershipRefsFromIdentity(identity: PatreonIdentityResponse): PatreonJsonApiRef[] {
  return normalizeJsonApiRefs(identity.data?.relationships?.memberships?.data).filter(
    (ref) => ref.type === 'member',
  );
}

function membersFromIncluded(included: PatreonIncludedResource[]): PatreonIncludedResource[] {
  return included.filter((x) => x.type === 'member');
}

function mergeMemberResources(
  fromIncluded: PatreonIncludedResource[],
  membershipRefs: PatreonJsonApiRef[],
): PatreonIncludedResource[] {
  const byId = new Map<string, PatreonIncludedResource>();
  for (const member of fromIncluded) {
    const id = normalizePatreonId(member.id);
    if (id) byId.set(id, member);
  }
  for (const ref of membershipRefs) {
    if (!byId.has(ref.id)) {
      byId.set(ref.id, { type: 'member', id: ref.id });
    }
  }
  return [...byId.values()];
}

function mergeIncludedResources(
  base: PatreonIncludedResource[],
  additions: PatreonIncludedResource[],
): PatreonIncludedResource[] {
  const seen = new Set(
    base.map((resource) => `${resource.type}:${normalizePatreonId(resource.id) ?? ''}`),
  );
  const merged = [...base];
  for (const resource of additions) {
    const key = `${resource.type}:${normalizePatreonId(resource.id) ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(resource);
  }
  return merged;
}

function memberResourceNeedsFetch(
  member: PatreonIncludedResource,
  included: PatreonIncludedResource[],
): boolean {
  const id = normalizePatreonId(member.id);
  if (!id) return false;

  const fullMember = included.find(
    (resource) => resource.type === 'member' && normalizePatreonId(resource.id) === id,
  );
  if (!fullMember) return true;

  const hasStatus = fullMember.attributes?.patron_status != null;
  const hasEntitled =
    normalizeEntitledTierRefs(fullMember.relationships?.currently_entitled_tiers?.data).length > 0;
  return !hasStatus && !hasEntitled;
}

export async function fetchPatreonMemberResource(
  accessToken: string,
  memberId: string,
): Promise<{ member: PatreonIncludedResource | null; included: PatreonIncludedResource[] }> {
  const url = buildPatreonMemberUrl(memberId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    console.warn('[patreon] member fetch failed', { memberId, status: res.status, body: body.slice(0, 256) });
    return { member: null, included: [] };
  }

  const json = await res.json();
  const member = (json.data ?? null) as PatreonIncludedResource | null;
  const included = (json.included ?? []) as PatreonIncludedResource[];
  return { member, included };
}

export async function enrichIdentityWithMembers(
  identity: PatreonIdentityResponse,
  accessToken: string,
): Promise<{
  members: PatreonIncludedResource[];
  included: PatreonIncludedResource[];
  debug: Record<string, unknown>;
}> {
  let included = identity.included ?? [];
  const includedTypesCount = countIncludedTypes(included);
  const membershipRefs = extractMembershipRefsFromIdentity(identity);
  let members = mergeMemberResources(membersFromIncluded(included), membershipRefs);

  const toFetch = new Set<string>();
  for (const member of members) {
    const id = normalizePatreonId(member.id);
    if (id && memberResourceNeedsFetch(member, included)) toFetch.add(id);
  }

  if (membershipRefs.length === 1) {
    toFetch.add(membershipRefs[0].id);
  }
  if (members.length === 0 && membershipRefs.length > 0) {
    for (const ref of membershipRefs) toFetch.add(ref.id);
  }

  const fetchedMemberIds: string[] = [];
  for (const memberId of toFetch) {
    const { member, included: fetchedIncluded } = await fetchPatreonMemberResource(
      accessToken,
      memberId,
    );
    fetchedMemberIds.push(memberId);
    if (!member) continue;

    const normalizedId = normalizePatreonId(member.id) ?? memberId;
    const existingIndex = members.findIndex((m) => normalizePatreonId(m.id) === normalizedId);
    if (existingIndex >= 0) members[existingIndex] = member;
    else members.push(member);

    included = mergeIncludedResources(included, [member, ...fetchedIncluded]);
  }

  return {
    members,
    included,
    debug: {
      includedTypesCount,
      membershipRefCount: membershipRefs.length,
      membershipRefIds: membershipRefs.map((ref) => ref.id),
      fetchedMemberIds,
    },
  };
}

/** Sanitize detail for query params (alphanumeric + underscore/dash). */
export function patreonSafeRedirectDetail(detail: string): string {
  return detail.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

/** Redirect browser to Settings after Patreon OAuth errors (never gateway JSON). */
export function patreonSettingsErrorRedirect(
  appOrigin: string,
  detail?: string,
  status: string = 'error',
): Response {
  const target = new URL('/settings', appOrigin);
  target.searchParams.set('patreon', status);
  if (detail) {
    const safe = patreonSafeRedirectDetail(detail);
    if (safe) target.searchParams.set('detail', safe);
  }
  return Response.redirect(target.toString(), 302);
}

/** Redirect after OAuth with tier outcome (connected vs linked-but-no-tier). */
export function patreonSettingsOAuthResultRedirect(
  appOrigin: string,
  returnPath: string,
  outcome: 'connected' | 'no_tier',
  detail?: string,
): Response {
  const path = returnPath.startsWith('/') ? returnPath : '/settings';
  const target = new URL(path, appOrigin);
  target.searchParams.set('patreon', outcome);
  if (detail) {
    const safe = patreonSafeRedirectDetail(detail);
    if (safe) target.searchParams.set('detail', safe);
  }
  return Response.redirect(target.toString(), 302);
}

/** Always log tier resolution (oauth + webhook); enable PATREON_TIER_DEBUG for full JSON. */
export function logPatreonTierResolution(
  context: string,
  details: Record<string, unknown>,
): void {
  console.log(`[patreon-tier] ${context}`, JSON.stringify(details));
  logPatreonTierDebug(context, details);
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

export type PatreonJsonApiRef = { id: string; type: string };

export type PatreonIncludedResource = {
  type: string;
  id?: string;
  attributes?: {
    title?: string;
    patron_status?: PatreonPatronStatus | null;
    [key: string]: unknown;
  };
  relationships?: {
    campaign?: { data?: { id?: string; type?: string } | null };
    currently_entitled_tiers?: {
      data?: { id: string; type: string }[] | { id: string; type: string } | null;
    };
    memberships?: {
      data?: PatreonJsonApiRef[] | PatreonJsonApiRef | null;
    };
    [key: string]: unknown;
  };
};

/** Patreon v2 GET /identity JSON:API body. */
export type PatreonIdentityResponse = {
  data?: {
    id?: string;
    type?: string;
    relationships?: {
      memberships?: {
        data?: PatreonJsonApiRef[] | PatreonJsonApiRef | null;
      };
    };
  };
  included?: PatreonIncludedResource[];
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
  const refs = Array.isArray(entitledRaw)
    ? entitledRaw
    : entitledRaw?.id
      ? [entitledRaw]
      : [];
  return refs
    .map((ref) => {
      const id = normalizePatreonId(ref.id);
      return id ? { id, type: ref.type } : null;
    })
    .filter((ref): ref is { id: string; type: string } => ref != null);
}

function entitledTierResourcesFromIds(
  included: PatreonIncludedResource[],
  entitledIds: Set<string>,
): { id: string; title: string }[] {
  const normalizedEntitledIds = new Set(
    [...entitledIds]
      .map((id) => normalizePatreonId(id))
      .filter((id): id is string => id != null),
  );
  if (normalizedEntitledIds.size === 0) return [];

  const foundIds = new Set<string>();
  const fromIncluded = included
    .map((x) => {
      if (x.type !== 'tier' && x.type !== 'reward') return null;
      const id = normalizePatreonId(x.id);
      if (!id || !normalizedEntitledIds.has(id)) return null;
      foundIds.add(id);
      const title = typeof x.attributes?.title === 'string' ? x.attributes.title : '';
      return { id, title };
    })
    .filter((resource): resource is { id: string; title: string } => resource != null);

  const fromIdsOnly = [...normalizedEntitledIds]
    .filter((id) => !foundIds.has(id))
    .map((id) => ({ id, title: '' }));

  return [...fromIncluded, ...fromIdsOnly];
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

function filterMembersForCampaign(
  members: PatreonIncludedResource[],
  campaignId: string | null,
): {
  relevantMembers: PatreonIncludedResource[];
  campaignFilterSkipped: boolean;
  campaignFilterMiss: boolean;
} {
  if (!campaignId) {
    return { relevantMembers: members, campaignFilterSkipped: false, campaignFilterMiss: false };
  }

  const strict = members.filter(
    (m) => normalizePatreonId(m.relationships?.campaign?.data?.id) === campaignId,
  );
  if (strict.length > 0) {
    return { relevantMembers: strict, campaignFilterSkipped: false, campaignFilterMiss: false };
  }

  const anyMemberHasCampaign = members.some(
    (m) => normalizePatreonId(m.relationships?.campaign?.data?.id) != null,
  );
  if (members.length > 0 && !anyMemberHasCampaign) {
    // memberships.campaign not included in API response — avoid filtering everyone out.
    return { relevantMembers: members, campaignFilterSkipped: true, campaignFilterMiss: true };
  }

  return { relevantMembers: strict, campaignFilterSkipped: false, campaignFilterMiss: true };
}

export function resolveAppTierFromIncludedMembers(
  included: PatreonIncludedResource[],
  options?: { campaignId?: string | null; members?: PatreonIncludedResource[] },
): {
  appTier: AppPatreonTier | null;
  patronStatus: 'active' | 'cancelled' | 'none';
  debug: Record<string, unknown>;
} {
  const campaignId = normalizePatreonId(options?.campaignId ?? getPatreonCreatorCampaignId());
  const members = options?.members ?? included.filter((x) => x.type === 'member');
  const { relevantMembers, campaignFilterSkipped, campaignFilterMiss } =
    filterMembersForCampaign(members, campaignId);

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
    const rewardIdMap = getPatreonTierRewardIdMap();

    memberDebug.push({
      memberId: member.id ?? null,
      campaignId: member.relationships?.campaign?.data?.id ?? null,
      patronStatus,
      entitledTierIds: [...entitledIds],
      entitledTitles: resources.map((r) => r.title).filter(Boolean),
      rewardIdMapKeys: [...rewardIdMap.keys()],
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
      campaignFilterSkipped,
      campaignFilterMiss,
      totalMemberCount: members.length,
      memberCount: relevantMembers.length,
      members: memberDebug,
      resolvedTier: appTier,
      resolvedStatus: patronStatus,
      rewardIdMapConfigured: getPatreonTierRewardIdMap().size > 0,
      rewardIdMapKeys: [...getPatreonTierRewardIdMap().keys()],
    },
  };
}

/** Classify why OAuth tier resolution returned null (for redirect detail + logs). */
export function patreonOAuthNoTierDetail(debug: Record<string, unknown>): string {
  const members = debug.members as Record<string, unknown>[] | undefined;
  const memberCount = typeof debug.memberCount === 'number' ? debug.memberCount : 0;
  const totalMemberCount =
    typeof debug.totalMemberCount === 'number' ? debug.totalMemberCount : memberCount;

  if (totalMemberCount === 0) return 'no_memberships';
  if (debug.campaignFilterMiss === true && debug.campaignFilterSkipped !== true) {
    return 'campaign_mismatch';
  }
  if (debug.campaignFilterMiss === true && debug.campaignFilterSkipped === true) {
    return 'campaign_include_missing';
  }

  const activeMembers = (members ?? []).filter((m) => m.patronStatus === 'active_patron');
  if (activeMembers.length === 0) return 'not_active_patron';

  const hasEntitled = activeMembers.some((m) => {
    const ids = m.entitledTierIds as string[] | undefined;
    return Array.isArray(ids) && ids.length > 0;
  });
  if (!hasEntitled) return 'no_entitled_tiers';

  return 'tier_id_mismatch';
}

/** Minimal identity payload self-test (run via deno test or PATREON_TIER_SELF_TEST=1). */
export function selfTestResolveAppTierFromIdentity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const rewardEnv = Deno.env.get('PATREON_TIER_REWARD_IDS');
  if (!rewardEnv) {
    Deno.env.set('PATREON_TIER_REWARD_IDS', '{"sweetie":"23433761","princess":"23433777","slut":"23433795"}');
    cachedRewardIdMap = null;
  }

  const minimalIdentity = {
    included: [
      {
        type: 'member',
        id: 'mem-1',
        attributes: { patron_status: 'active_patron' as const },
        relationships: {
          campaign: { data: { id: '999', type: 'campaign' } },
          currently_entitled_tiers: { data: [{ id: '23433777', type: 'tier' }] },
        },
      },
      {
        type: 'tier',
        id: '23433777',
        attributes: { title: 'Princess' },
      },
    ] as PatreonIncludedResource[],
  };

  const { appTier, patronStatus } = resolveAppTierFromIdentityResponseSync(minimalIdentity);
  if (appTier !== 'princess') errors.push(`expected princess, got ${appTier}`);
  if (patronStatus !== 'active') errors.push(`expected active, got ${patronStatus}`);

  const membershipRefsOnly: PatreonIdentityResponse = {
    data: {
      relationships: {
        memberships: { data: [{ id: 'mem-ref-1', type: 'member' }] },
      },
    },
    included: [],
  };
  const refsOnly = resolveAppTierFromIdentityResponseSync(membershipRefsOnly);
  if (refsOnly.debug.memberCount !== 1) {
    errors.push(`membership refs only: expected memberCount 1, got ${refsOnly.debug.memberCount}`);
  }
  if (refsOnly.debug.membershipRefCount !== 1) {
    errors.push(
      `membership refs only: expected membershipRefCount 1, got ${refsOnly.debug.membershipRefCount}`,
    );
  }

  const campaignFiltered = resolveAppTierFromIncludedMembers(minimalIdentity.included, {
    campaignId: '999',
  });
  if (campaignFiltered.appTier !== 'princess') {
    errors.push(`campaign filter: expected princess, got ${campaignFiltered.appTier}`);
  }

  const wrongCampaign = resolveAppTierFromIncludedMembers(minimalIdentity.included, {
    campaignId: 'wrong',
  });
  if (wrongCampaign.appTier !== null) {
    errors.push(`wrong campaign should yield null, got ${wrongCampaign.appTier}`);
  }

  const missingCampaignInclude = resolveAppTierFromIncludedMembers(
    [
      {
        type: 'member',
        attributes: { patron_status: 'active_patron' },
        relationships: {
          currently_entitled_tiers: { data: [{ id: '23433761', type: 'tier' }] },
        },
      },
    ],
    { campaignId: '999' },
  );
  if (missingCampaignInclude.appTier !== 'sweetie') {
    errors.push(
      `missing campaign include fallback: expected sweetie, got ${missingCampaignInclude.appTier}`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/** Sync tier resolution from identity JSON (self-tests and unit-style checks). */
export function resolveAppTierFromIdentityResponseSync(
  identity: PatreonIdentityResponse,
  options?: {
    members?: PatreonIncludedResource[];
    included?: PatreonIncludedResource[];
    enrichDebug?: Record<string, unknown>;
  },
): {
  appTier: AppPatreonTier | null;
  patronStatus: 'active' | 'cancelled' | 'none';
  debug: Record<string, unknown>;
} {
  const included = options?.included ?? identity.included ?? [];
  const membershipRefs = extractMembershipRefsFromIdentity(identity);
  const members =
    options?.members ?? mergeMemberResources(membersFromIncluded(included), membershipRefs);
  const enrichDebug = options?.enrichDebug ?? {
    includedTypesCount: countIncludedTypes(included),
    membershipRefCount: membershipRefs.length,
    membershipRefIds: membershipRefs.map((ref) => ref.id),
    fetchedMemberIds: [] as string[],
  };

  const campaignId = normalizePatreonId(getPatreonCreatorCampaignId());
  let result = resolveAppTierFromIncludedMembers(included, { campaignId, members });

  if (campaignId && members.length > 0 && result.debug.memberCount === 0) {
    const unfiltered = resolveAppTierFromIncludedMembers(included, {
      campaignId: null,
      members,
    });
    result = {
      ...unfiltered,
      debug: {
        ...unfiltered.debug,
        ...enrichDebug,
        campaignFilterRetriedUnfiltered: true,
      },
    };
  } else {
    result = { ...result, debug: { ...result.debug, ...enrichDebug } };
  }

  return result;
}

/** Resolve tier from Patreon /identity JSON (OAuth callback). Fetches member resources when needed. */
export async function resolveAppTierFromIdentityResponse(
  identity: PatreonIdentityResponse,
  accessToken?: string,
): Promise<{
  appTier: AppPatreonTier | null;
  patronStatus: 'active' | 'cancelled' | 'none';
  debug: Record<string, unknown>;
}> {
  if (accessToken) {
    const enriched = await enrichIdentityWithMembers(identity, accessToken);
    return resolveAppTierFromIdentityResponseSync(identity, {
      members: enriched.members,
      included: enriched.included,
      enrichDebug: enriched.debug,
    });
  }
  return resolveAppTierFromIdentityResponseSync(identity);
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
