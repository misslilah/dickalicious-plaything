export type ContentTier = 'public' | 'sweetie' | 'princess' | 'slut';
export type PatreonMemberTier = 'sweetie' | 'princess' | 'slut';
export type PatreonStatus = 'active' | 'cancelled' | 'none';

const TIER_ORDER: ContentTier[] = ['public', 'sweetie', 'princess', 'slut'];

export function tierRank(tier: ContentTier | null | undefined): number {
  if (!tier || tier === 'public') return 0;
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 ? idx : 0;
}

export function memberTierRank(
  tier: PatreonMemberTier | null | undefined,
  status: PatreonStatus | null | undefined,
): number {
  if (status !== 'active' || !tier) return 0;
  return tierRank(tier);
}

export function canAccessTier(
  required: ContentTier | null | undefined,
  userTier: PatreonMemberTier | null | undefined,
  userStatus: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): boolean {
  if (isAdmin) return true;
  return tierRank(required ?? 'public') <= memberTierRank(userTier, userStatus);
}

export function effectiveVideoTier(
  videoTier: ContentTier | null | undefined,
  categoryTier: ContentTier | null | undefined,
): ContentTier {
  return videoTier ?? categoryTier ?? 'public';
}

export const TIER_LABELS: Record<ContentTier, string> = {
  public: 'Public',
  sweetie: 'Sweetie',
  princess: 'Princess',
  slut: 'Slut',
};

export function tierLabel(tier: ContentTier | null | undefined): string {
  return TIER_LABELS[tier ?? 'public'] ?? 'Public';
}

export function requiresTierMessage(tier: ContentTier): string {
  return `Requires ${tierLabel(tier)}`;
}

export const TIER_CHIP_OPTIONS: { value: ContentTier; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'sweetie', label: 'Sweetie' },
  { value: 'princess', label: 'Princess' },
  { value: 'slut', label: 'Slut' },
];

export const PATREON_MEMBER_TIER_OPTIONS: { value: PatreonMemberTier | ''; label: string }[] = [
  { value: '', label: 'None (public only)' },
  { value: 'sweetie', label: 'Sweetie' },
  { value: 'princess', label: 'Princess' },
  { value: 'slut', label: 'Slut' },
];
