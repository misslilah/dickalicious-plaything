import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { VideoPlaylistType } from '../types';

const STORAGE_KEY = 'videoPlaylistPlayback';

export interface ActiveVideoPlaylist {
  playlistId: string;
  title: string;
  type: VideoPlaylistType;
  videoIds: string[];
  index: number;
}

interface PersistedPlaylist {
  playlistId: string;
  title: string;
  type: VideoPlaylistType;
  videoIds: string[];
  index: number;
}

function readPersisted(): ActiveVideoPlaylist | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPlaylist;
    if (
      !parsed.playlistId ||
      !Array.isArray(parsed.videoIds) ||
      parsed.videoIds.length === 0
    ) {
      return null;
    }
    const index = Math.min(
      Math.max(0, parsed.index ?? 0),
      parsed.videoIds.length - 1,
    );
    return {
      playlistId: parsed.playlistId,
      title: parsed.title,
      type: parsed.type,
      videoIds: parsed.videoIds,
      index,
    };
  } catch {
    return null;
  }
}

function writePersisted(active: ActiveVideoPlaylist | null) {
  if (!active) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      playlistId: active.playlistId,
      title: active.title,
      type: active.type,
      videoIds: active.videoIds,
      index: active.index,
    }),
  );
}

interface VideoPlaylistPlaybackContextValue {
  active: ActiveVideoPlaylist | null;
  progress: { current: number; total: number; title: string } | null;
  startPlaylist: (params: {
    playlistId: string;
    title: string;
    type: VideoPlaylistType;
    videoIds: string[];
    startIndex?: number;
  }) => void;
  setPlaylistIndex: (index: number) => void;
  exitPlaylist: () => void;
  advanceInteractivePlaylist: () => boolean;
  restoreFromStorage: () => ActiveVideoPlaylist | null;
}

const VideoPlaylistPlaybackContext =
  createContext<VideoPlaylistPlaybackContextValue | null>(null);

export function VideoPlaylistPlaybackProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [active, setActive] = useState<ActiveVideoPlaylist | null>(() =>
    readPersisted(),
  );

  const progress = useMemo(() => {
    if (!active || active.videoIds.length === 0) return null;
    return {
      current: active.index + 1,
      total: active.videoIds.length,
      title: active.title,
    };
  }, [active]);

  const startPlaylist = useCallback(
    (params: {
      playlistId: string;
      title: string;
      type: VideoPlaylistType;
      videoIds: string[];
      startIndex?: number;
    }) => {
      if (params.videoIds.length === 0) return;
      const index = Math.min(
        Math.max(0, params.startIndex ?? 0),
        params.videoIds.length - 1,
      );
      const next: ActiveVideoPlaylist = {
        playlistId: params.playlistId,
        title: params.title,
        type: params.type,
        videoIds: params.videoIds,
        index,
      };
      setActive(next);
      writePersisted(next);
    },
    [],
  );

  const setPlaylistIndex = useCallback((index: number) => {
    setActive((prev) => {
      if (!prev) return prev;
      const clamped = Math.min(Math.max(0, index), prev.videoIds.length - 1);
      const next = { ...prev, index: clamped };
      writePersisted(next);
      return next;
    });
  }, []);

  const exitPlaylist = useCallback(() => {
    setActive(null);
    writePersisted(null);
  }, []);

  const advanceInteractivePlaylist = useCallback(() => {
    const prev = readPersisted();
    if (!prev || prev.type !== 'interactive') return false;
    const nextIndex = prev.index + 1;
    if (nextIndex >= prev.videoIds.length) {
      setActive(null);
      writePersisted(null);
      return false;
    }
    const next: ActiveVideoPlaylist = { ...prev, index: nextIndex };
    setActive(next);
    writePersisted(next);
    const nextVideoId = prev.videoIds[nextIndex];
    navigate(`/videos/interactive/${nextVideoId}?playlist=${prev.playlistId}`, {
      replace: true,
    });
    return true;
  }, [navigate]);

  const restoreFromStorage = useCallback(() => {
    const stored = readPersisted();
    if (stored) setActive(stored);
    return stored;
  }, []);

  const value = useMemo<VideoPlaylistPlaybackContextValue>(
    () => ({
      active,
      progress,
      startPlaylist,
      setPlaylistIndex,
      exitPlaylist,
      advanceInteractivePlaylist,
      restoreFromStorage,
    }),
    [
      active,
      progress,
      startPlaylist,
      setPlaylistIndex,
      exitPlaylist,
      advanceInteractivePlaylist,
      restoreFromStorage,
    ],
  );

  return (
    <VideoPlaylistPlaybackContext.Provider value={value}>
      {children}
    </VideoPlaylistPlaybackContext.Provider>
  );
}

export function useVideoPlaylistPlayback(): VideoPlaylistPlaybackContextValue {
  const ctx = useContext(VideoPlaylistPlaybackContext);
  if (!ctx) {
    throw new Error(
      'useVideoPlaylistPlayback must be used within VideoPlaylistPlaybackProvider',
    );
  }
  return ctx;
}

export function useOptionalVideoPlaylistPlayback(): VideoPlaylistPlaybackContextValue | null {
  return useContext(VideoPlaylistPlaybackContext);
}
