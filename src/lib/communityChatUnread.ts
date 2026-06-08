import type { CommunityChannel } from './communityChannels';
import { COMMUNITY_CHANNELS } from './communityChannels';

export type CommunityUnreadView = CommunityChannel | 'admin-contact' | 'admin-inbox';

const STORAGE_PREFIX = 'community-chat-last-read:';

export function getLastReadTimestamps(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function setLastReadTimestamp(
  userId: string,
  view: CommunityUnreadView,
  iso: string,
): void {
  const store = getLastReadTimestamps(userId);
  store[view] = iso;
  localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(store));
}

export function markCommunityViewRead(userId: string, view: CommunityUnreadView): void {
  setLastReadTimestamp(userId, view, new Date().toISOString());
}

export function truncateMessagePreview(body: string, max = 80): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function formatUnreadBadgeCount(count: number): string {
  if (count <= 0) return '0';
  return count > 9 ? '9+' : String(count);
}

export const COMMUNITY_UNREAD_CHANNEL_VIEWS: CommunityChannel[] = COMMUNITY_CHANNELS.map(
  (channel) => channel.id,
);

export function emptyUnreadCounts(): Record<CommunityUnreadView, number> {
  return {
    global: 0,
    sweetie: 0,
    princess: 0,
    slut: 0,
    'admin-contact': 0,
    'admin-inbox': 0,
  };
}
