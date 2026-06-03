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

/** Blocking message when a video category tier is not met (null = accessible). */
export function getVideoCategoryLockMessage(
  requiredTier: ContentTier | null | undefined,
  userTier: PatreonMemberTier | null | undefined,
  userStatus: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): string | null {
  const required = requiredTier ?? 'public';
  if (canAccessTier(required, userTier, userStatus, isAdmin)) return null;
  if (required === 'public') return null;
  return `${requiresTierMessage(required)} Patreon tier or higher. Connect Patreon in Settings to upgrade.`;
}

export const TIER_CHIP_OPTIONS: { value: ContentTier; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'sweetie', label: 'Sweetie' },
  { value: 'princess', label: 'Princess' },
  { value: 'slut', label: 'Slut' },
];

/** Minimum Patreon tier for upload / access (cumulative). */
export const VIDEO_ACCESS_OPTIONS: { value: ContentTier; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'sweetie', label: 'Sweetie+' },
  { value: 'princess', label: 'Princess+' },
  { value: 'slut', label: 'Slut only' },
];

const ACCESS_DESCRIPTIONS: Record<ContentTier, string> = {
  public: 'Everyone with an account can watch.',
  sweetie: 'Sweetie, Princess, and Slut patrons can watch.',
  princess: 'Princess and Slut patrons can watch.',
  slut: 'Only Slut-tier patrons can watch.',
};

export function tierAccessLabel(tier: ContentTier | null | undefined): string {
  const t = tier ?? 'public';
  const opt = VIDEO_ACCESS_OPTIONS.find((o) => o.value === t);
  return opt?.label ?? tierLabel(t);
}

export function tierAccessHint(tier: ContentTier | null | undefined): string {
  return ACCESS_DESCRIPTIONS[tier ?? 'public'];
}

export const VIDEO_ACCESS_CUMULATIVE_NOTE =
  'Access is cumulative: choosing a tier also includes all higher Patreon tiers.';

export const PATREON_MEMBER_TIER_OPTIONS: { value: PatreonMemberTier | ''; label: string }[] = [
  { value: '', label: 'None (public only)' },
  { value: 'sweetie', label: 'Sweetie' },
  { value: 'princess', label: 'Princess' },
  { value: 'slut', label: 'Slut' },
];

/** Patreon tier gate for audio playlists (null = no tier requirement). */
export const AUDIO_PLAYLIST_TIER_OPTIONS: { value: PatreonMemberTier | ''; label: string }[] = [
  { value: '', label: 'None (everyone)' },
  { value: 'sweetie', label: 'Sweetie' },
  { value: 'princess', label: 'Princess' },
  { value: 'slut', label: 'Slut' },
];
