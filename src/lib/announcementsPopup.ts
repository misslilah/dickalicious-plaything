import {
  getLastReadTimestamps,
  setLastReadTimestamp,
} from './communityChatUnread';

export type AnnouncementCursor = {
  id: string;
  createdAt: string;
};

const SEEN_PREFIX = 'announcements-popup-seen:';

type StoredSeen = {
  id: string;
  at: string;
};

function seenStorageKey(userId: string): string {
  return `${SEEN_PREFIX}${userId}`;
}

function readSeen(userId: string): StoredSeen | null {
  try {
    const raw = localStorage.getItem(seenStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSeen;
    if (!parsed?.id || typeof parsed.at !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isNewerThanSeen(latest: AnnouncementCursor, seen: StoredSeen): boolean {
  if (seen.id === latest.id) return false;
  return latest.createdAt > seen.at;
}

export function latestAnnouncementCursor(
  messages: { id: string; createdAt: string }[],
): AnnouncementCursor | null {
  if (messages.length === 0) return null;
  return messages.reduce((latest, item) =>
    item.createdAt > latest.createdAt ? item : latest,
  );
}

export function shouldShowAnnouncementsPopup(
  userId: string,
  latest: AnnouncementCursor | null,
): boolean {
  if (!userId || !latest) return false;
  const seen = readSeen(userId);
  if (seen && !isNewerThanSeen(latest, seen)) return false;
  try {
    const lastRead = getLastReadTimestamps(userId).announcements;
    if (lastRead && latest.createdAt <= lastRead) return false;
  } catch {
    /* private mode / blocked storage */
  }
  return true;
}

export function markAnnouncementsPopupSeen(
  userId: string,
  latest: AnnouncementCursor,
): void {
  if (!userId || !latest.id) return;
  try {
    const stored: StoredSeen = { id: latest.id, at: latest.createdAt };
    localStorage.setItem(seenStorageKey(userId), JSON.stringify(stored));
    const now = new Date().toISOString();
    const readAt = latest.createdAt > now ? latest.createdAt : now;
    setLastReadTimestamp(userId, 'announcements', readAt);
  } catch {
    /* private mode / blocked storage */
  }
}
