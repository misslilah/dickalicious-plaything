import type { AudioPlaylist, PatreonMemberTier, PatreonStatus } from '../types';
import { canAccessTier, requiresTierMessage } from './tiers';

const STORAGE_PREFIX = 'audio-playlist-progress:';

export interface AudioProgressState {
  completedTrackIds: string[];
  positions: Record<string, number>;
  lastTrackId: string | null;
  lastPlaylistId: string | null;
}

const EMPTY: AudioProgressState = {
  completedTrackIds: [],
  positions: {},
  lastTrackId: null,
  lastPlaylistId: null,
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadAudioProgress(userId: string | undefined): AudioProgressState {
  if (!userId) return { ...EMPTY, completedTrackIds: [], positions: {} };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<AudioProgressState>;
    return {
      completedTrackIds: Array.isArray(parsed.completedTrackIds)
        ? parsed.completedTrackIds.filter((id): id is string => typeof id === 'string')
        : [],
      positions:
        parsed.positions && typeof parsed.positions === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.positions).filter(
                ([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
              ),
            )
          : {},
      lastTrackId:
        typeof parsed.lastTrackId === 'string' ? parsed.lastTrackId : null,
      lastPlaylistId:
        typeof parsed.lastPlaylistId === 'string' ? parsed.lastPlaylistId : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveAudioProgress(
  userId: string | undefined,
  state: AudioProgressState,
): void {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    /* quota or private mode */
  }
}

export function hasAudioProgress(state: AudioProgressState): boolean {
  return (
    state.completedTrackIds.length > 0 ||
    Object.keys(state.positions).length > 0 ||
    state.lastTrackId != null
  );
}

export function isTrackUnlocked(
  trackIndex: number,
  completedTrackIds: string[],
  playlistIds: string[],
): boolean {
  if (trackIndex <= 0) return true;
  const prevId = playlistIds[trackIndex - 1];
  return prevId != null && completedTrackIds.includes(prevId);
}

export function canPlayTrack(
  trackId: string,
  trackIndex: number,
  completedTrackIds: string[],
  playlistIds: string[],
): boolean {
  if (completedTrackIds.includes(trackId)) return true;
  return isTrackUnlocked(trackIndex, completedTrackIds, playlistIds);
}

export function isPlaylistCompleted(
  trackIds: string[],
  completedTrackIds: string[],
): boolean {
  if (trackIds.length === 0) return false;
  return trackIds.every((id) => completedTrackIds.includes(id));
}

export function getPrerequisitePlaylist(
  playlist: AudioPlaylist,
  playlists: AudioPlaylist[],
): AudioPlaylist | null {
  if (!playlist.unlockAfterPlaylistId) return null;
  return playlists.find((p) => p.id === playlist.unlockAfterPlaylistId) ?? null;
}

export function hasPlaylistTierAccess(
  playlist: AudioPlaylist,
  userTier: PatreonMemberTier | null | undefined,
  userStatus: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): boolean {
  if (!playlist.patreonTier) return true;
  return canAccessTier(playlist.patreonTier, userTier, userStatus, isAdmin);
}

export function isPrerequisitePlaylistComplete(
  playlist: AudioPlaylist,
  playlists: AudioPlaylist[],
  trackIdsByPlaylist: Record<string, string[]>,
  completedTrackIds: string[],
): boolean {
  const prereq = getPrerequisitePlaylist(playlist, playlists);
  if (!prereq) return true;
  const prereqTrackIds = trackIdsByPlaylist[prereq.id] ?? [];
  return isPlaylistCompleted(prereqTrackIds, completedTrackIds);
}

export function isPlaylistAccessible(
  playlist: AudioPlaylist,
  playlists: AudioPlaylist[],
  trackIdsByPlaylist: Record<string, string[]>,
  completedTrackIds: string[],
  userTier: PatreonMemberTier | null | undefined,
  userStatus: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): boolean {
  if (!hasPlaylistTierAccess(playlist, userTier, userStatus, isAdmin)) return false;
  return isPrerequisitePlaylistComplete(
    playlist,
    playlists,
    trackIdsByPlaylist,
    completedTrackIds,
  );
}

export function getPlaylistLockMessage(
  playlist: AudioPlaylist,
  playlists: AudioPlaylist[],
  trackIdsByPlaylist: Record<string, string[]>,
  completedTrackIds: string[],
  userTier: PatreonMemberTier | null | undefined,
  userStatus: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): string | null {
  if (
    isPlaylistAccessible(
      playlist,
      playlists,
      trackIdsByPlaylist,
      completedTrackIds,
      userTier,
      userStatus,
      isAdmin,
    )
  ) {
    return null;
  }

  const parts: string[] = [];

  if (!hasPlaylistTierAccess(playlist, userTier, userStatus, isAdmin) && playlist.patreonTier) {
    parts.push(
      `${requiresTierMessage(playlist.patreonTier)} Patreon tier or higher. Connect Patreon in Settings to upgrade.`,
    );
  }

  const prereq = getPrerequisitePlaylist(playlist, playlists);
  if (
    prereq &&
    !isPrerequisitePlaylistComplete(
      playlist,
      playlists,
      trackIdsByPlaylist,
      completedTrackIds,
    )
  ) {
    parts.push(`Complete "${prereq.title}" before accessing this playlist.`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

export function isPlaylistUnlocked(
  playlist: AudioPlaylist,
  playlists: AudioPlaylist[],
  trackIdsByPlaylist: Record<string, string[]>,
  completedTrackIds: string[],
): boolean {
  return isPrerequisitePlaylistComplete(
    playlist,
    playlists,
    trackIdsByPlaylist,
    completedTrackIds,
  );
}

export function wouldCreateUnlockCycle(
  playlistId: string,
  unlockAfterPlaylistId: string | null,
  playlists: AudioPlaylist[],
): boolean {
  if (!unlockAfterPlaylistId) return false;
  let current: string | null = unlockAfterPlaylistId;
  const visited = new Set<string>();
  while (current) {
    if (current === playlistId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const next = playlists.find((p) => p.id === current);
    current = next?.unlockAfterPlaylistId ?? null;
  }
  return false;
}
