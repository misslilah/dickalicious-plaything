import type { PatreonMemberTier, PatreonStatus } from '../types';
import { memberTierRank } from './tiers';

export type CommunityChannel = 'global' | 'sweetie' | 'princess' | 'slut';

export const COMMUNITY_CHANNELS: {
  id: CommunityChannel;
  label: string;
  minTierLabel: string | null;
}[] = [
  { id: 'global', label: 'Global', minTierLabel: null },
  { id: 'sweetie', label: 'Sweeties', minTierLabel: 'Sweetie' },
  { id: 'princess', label: 'Princess', minTierLabel: 'Princess' },
  { id: 'slut', label: 'Sluts', minTierLabel: 'Slut' },
];

const CHANNEL_MIN_RANK: Record<CommunityChannel, number> = {
  global: 0,
  sweetie: 1,
  princess: 2,
  slut: 3,
};

/** Higher Patreon tiers can access lower-tier rooms; lower tiers cannot access higher rooms. */
export function canAccessCommunityChannel(
  channel: CommunityChannel,
  userTier: PatreonMemberTier | null | undefined,
  userStatus: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): boolean {
  if (isAdmin) return true;
  if (channel === 'global') return true;
  return memberTierRank(userTier, userStatus) >= CHANNEL_MIN_RANK[channel];
}

export function getCommunityChannelLockMessage(channel: CommunityChannel): string {
  const meta = COMMUNITY_CHANNELS.find((c) => c.id === channel);
  if (!meta?.minTierLabel) return '';
  return `${meta.minTierLabel} tier required`;
}
