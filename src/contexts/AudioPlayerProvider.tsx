import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  canPlayTrack,
  getPlaylistLockMessage as buildPlaylistLockMessage,
  hasAudioProgress,
  isPlaylistAccessible as canAccessPlaylist,
  isPlaylistCompleted,
  isTrackUnlocked,
  loadAudioProgress,
  saveAudioProgress,
  type AudioProgressState,
} from '../lib/audioProgress';
import {
  fetchAudioLibrary,
  itemsForPlaylist,
  trackIdsByPlaylist,
} from '../lib/audioPlaylist';
import { useAppStore } from '../hooks/useAppStore';
import type { AudioPlaylist, AudioPlaylistItem } from '../types';

const SEEK_TOLERANCE_SEC = 1.25;
const POSITION_SAVE_INTERVAL_MS = 2000;

interface AudioPlayerContextValue {
  playlists: AudioPlaylist[];
  allItems: AudioPlaylistItem[];
  playlist: AudioPlaylistItem[];
  currentPlaylist: AudioPlaylist | null;
  currentPlaylistId: string | null;
  loading: boolean;
  error: string | null;
  currentTrack: AudioPlaylistItem | null;
  currentIndex: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  progress: AudioProgressState;
  hasPlaylistContent: boolean;
  showPreview: boolean;
  setShowPreview: (open: boolean) => void;
  refreshPlaylist: () => Promise<void>;
  selectPlaylist: (playlistId: string | null) => void;
  playTrack: (trackId: string) => void;
  togglePlay: () => void;
  /** Pause playback without clearing playlist progress. */
  pausePlayback: () => void;
  previousTrack: () => void;
  toggleLoop: () => void;
  isTrackPlayable: (trackId: string) => boolean;
  isTrackLocked: (trackId: string) => boolean;
  isPlaylistAccessible: (playlistId: string) => boolean;
  isPlaylistComplete: (playlistId: string) => boolean;
  getPlaylistLockMessage: (playlistId: string) => string | null;
  trackStatus: (trackId: string) => 'locked' | 'unlocked' | 'completed' | 'current';
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const { session } = useAppStore();
  const userId = session?.userId;
  const isAdmin = session?.role === 'admin';

  const [playlists, setPlaylists] = useState<AudioPlaylist[]>([]);
  const [allItems, setAllItems] = useState<AudioPlaylistItem[]>([]);
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [progress, setProgress] = useState<AudioProgressState>(() =>
    loadAudioProgress(userId),
  );
  const [showPreview, setShowPreview] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTimeRef = useRef(0);
  const lastSaveRef = useRef(0);
  const progressRef = useRef(progress);
  const loopEnabledRef = useRef(loopEnabled);
  const playlistRef = useRef<AudioPlaylistItem[]>([]);
  const allItemsRef = useRef(allItems);
  const playlistsRef = useRef(playlists);

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    allItemsRef.current = allItems;
  }, [allItems]);

  useEffect(() => {
    playlistsRef.current = playlists;
  }, [playlists]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const next = loadAudioProgress(userId);
    setProgress(next);
    setCurrentTrackId(next.lastTrackId);
    setCurrentPlaylistId(next.lastPlaylistId);
  }, [userId]);

  const persistProgress = useCallback(
    (next: AudioProgressState) => {
      progressRef.current = next;
      setProgress(next);
      saveAudioProgress(userId, next);
    },
    [userId],
  );

  const refreshPlaylist = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchAudioLibrary();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setPlaylists([]);
      setAllItems([]);
      return;
    }
    setPlaylists(result.library.playlists);
    setAllItems(result.library.items);
  }, []);

  useEffect(() => {
    void refreshPlaylist();
  }, [refreshPlaylist]);

  const playlist = useMemo(() => {
    if (!currentPlaylistId) return [];
    return itemsForPlaylist(currentPlaylistId, allItems);
  }, [currentPlaylistId, allItems]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  const currentPlaylist = useMemo(
    () => playlists.find((p) => p.id === currentPlaylistId) ?? null,
    [playlists, currentPlaylistId],
  );

  const trackIdsMap = useMemo(
    () => trackIdsByPlaylist(allItems),
    [allItems],
  );

  const selectPlaylist = useCallback((playlistId: string | null) => {
    setCurrentPlaylistId(playlistId);
    if (playlistId) {
      persistProgress({ ...progressRef.current, lastPlaylistId: playlistId });
    }
  }, [persistProgress]);

  useEffect(() => {
    if (!currentPlaylistId && progress.lastPlaylistId) {
      const exists = playlists.some((p) => p.id === progress.lastPlaylistId);
      if (exists) {
        setCurrentPlaylistId(progress.lastPlaylistId);
        return;
      }
    }
    if (!currentPlaylistId && playlists.length > 0 && allItems.length > 0) {
      const firstWithTracks = playlists.find(
        (p) => (trackIdsMap[p.id]?.length ?? 0) > 0,
      );
      if (firstWithTracks) {
        setCurrentPlaylistId(firstWithTracks.id);
      }
    }
  }, [currentPlaylistId, progress.lastPlaylistId, playlists, allItems.length, trackIdsMap]);

  const currentIndex = useMemo(() => {
    if (!currentTrackId) return -1;
    return playlist.findIndex((t) => t.id === currentTrackId);
  }, [playlist, currentTrackId]);

  const currentTrack =
    currentIndex >= 0 ? playlist[currentIndex] ?? null : null;

  const isPlaylistAccessible = useCallback(
    (playlistId: string) => {
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl) return false;
      return canAccessPlaylist(
        pl,
        playlists,
        trackIdsMap,
        progress.completedTrackIds,
        session?.patreonTier,
        session?.patreonStatus,
        isAdmin,
      );
    },
    [
      playlists,
      trackIdsMap,
      progress.completedTrackIds,
      session?.patreonTier,
      session?.patreonStatus,
      isAdmin,
    ],
  );

  const isPlaylistComplete = useCallback(
    (playlistId: string) => {
      const ids = trackIdsMap[playlistId] ?? [];
      return isPlaylistCompleted(ids, progress.completedTrackIds);
    },
    [trackIdsMap, progress.completedTrackIds],
  );

  const getPlaylistLockMessage = useCallback(
    (playlistId: string): string | null => {
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl) return null;
      return buildPlaylistLockMessage(
        pl,
        playlists,
        trackIdsMap,
        progress.completedTrackIds,
        session?.patreonTier,
        session?.patreonStatus,
        isAdmin,
      );
    },
    [
      playlists,
      trackIdsMap,
      progress.completedTrackIds,
      session?.patreonTier,
      session?.patreonStatus,
      isAdmin,
    ],
  );

  const isTrackPlayable = useCallback(
    (trackId: string) => {
      const track = allItems.find((t) => t.id === trackId);
      if (!track) return false;
      if (!isPlaylistAccessible(track.playlistId)) return false;
      const plTracks = itemsForPlaylist(track.playlistId, allItems);
      const idx = plTracks.findIndex((t) => t.id === trackId);
      if (idx < 0) return false;
      const ids = plTracks.map((t) => t.id);
      return canPlayTrack(
        trackId,
        idx,
        progress.completedTrackIds,
        ids,
      );
    },
    [allItems, isPlaylistAccessible, progress.completedTrackIds],
  );

  const isTrackLocked = useCallback(
    (trackId: string) => !isTrackPlayable(trackId),
    [isTrackPlayable],
  );

  const trackStatus = useCallback(
    (trackId: string): 'locked' | 'unlocked' | 'completed' | 'current' => {
      if (trackId === currentTrackId) return 'current';
      if (progress.completedTrackIds.includes(trackId)) return 'completed';
      const track = allItems.find((t) => t.id === trackId);
      if (!track || !isPlaylistAccessible(track.playlistId)) return 'locked';
      const plTracks = itemsForPlaylist(track.playlistId, allItems);
      const idx = plTracks.findIndex((t) => t.id === trackId);
      if (idx < 0) return 'locked';
      const ids = plTracks.map((t) => t.id);
      return isTrackUnlocked(idx, progress.completedTrackIds, ids)
        ? 'unlocked'
        : 'locked';
    },
    [
      currentTrackId,
      allItems,
      isPlaylistAccessible,
      progress.completedTrackIds,
    ],
  );

  const markComplete = useCallback(
    (trackId: string) => {
      const nextPositions = { ...progressRef.current.positions };
      delete nextPositions[trackId];
      const completed = progressRef.current.completedTrackIds.includes(trackId)
        ? progressRef.current.completedTrackIds
        : [...progressRef.current.completedTrackIds, trackId];
      persistProgress({
        ...progressRef.current,
        completedTrackIds: completed,
        positions: nextPositions,
      });
    },
    [persistProgress],
  );

  const savePosition = useCallback(
    (trackId: string, seconds: number) => {
      if (progressRef.current.completedTrackIds.includes(trackId)) return;
      const track = allItemsRef.current.find((t) => t.id === trackId);
      persistProgress({
        ...progressRef.current,
        positions: { ...progressRef.current.positions, [trackId]: seconds },
        lastTrackId: trackId,
        lastPlaylistId: track?.playlistId ?? progressRef.current.lastPlaylistId,
      });
    },
    [persistProgress],
  );

  const loadTrack = useCallback(
    async (track: AudioPlaylistItem, autoplay: boolean) => {
      const audio = audioRef.current;
      if (!audio) return;

      setCurrentPlaylistId(track.playlistId);

      lastTimeRef.current = 0;
      audio.src = track.url;
      audio.load();

      const saved = progressRef.current.positions[track.id] ?? 0;
      const applySeek = () => {
        if (saved > 0 && !progressRef.current.completedTrackIds.includes(track.id)) {
          audio.currentTime = saved;
          lastTimeRef.current = saved;
        }
      };

      if (audio.readyState >= 1) {
        applySeek();
      } else {
        audio.addEventListener('loadedmetadata', applySeek, { once: true });
      }

      setCurrentTrackId(track.id);
      persistProgress({
        ...progressRef.current,
        lastTrackId: track.id,
        lastPlaylistId: track.playlistId,
      });

      if (autoplay) {
        try {
          await audio.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(false);
      }
    },
    [persistProgress],
  );

  const playTrack = useCallback(
    (trackId: string) => {
      if (!isTrackPlayable(trackId)) return;
      const track = allItems.find((t) => t.id === trackId);
      if (!track) return;
      void loadTrack(track, true);
    },
    [isTrackPlayable, allItems, loadTrack],
  );

  const pausePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    audio.pause();
    setIsPlaying(false);
    const trackId = progressRef.current.lastTrackId;
    if (trackId) savePosition(trackId, audio.currentTime);
  }, [savePosition]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      pausePlayback();
      return;
    }
    void audio.play().then(
      () => setIsPlaying(true),
      () => setIsPlaying(false),
    );
  }, [currentTrack, isPlaying, pausePlayback]);

  const previousTrack = useCallback(() => {
    if (!currentTrack || currentIndex < 0) return;
    const audio = audioRef.current;

    if (currentIndex > 0) {
      const prev = playlist[currentIndex - 1];
      if (prev && isTrackPlayable(prev.id)) {
        void loadTrack(prev, true);
        return;
      }
    }

    if (audio) {
      audio.currentTime = 0;
      lastTimeRef.current = 0;
      savePosition(currentTrack.id, 0);
      if (isPlaying) void audio.play();
    }
  }, [
    currentTrack,
    currentIndex,
    playlist,
    isTrackPlayable,
    loadTrack,
    isPlaying,
    savePosition,
  ]);

  const toggleLoop = useCallback(() => {
    setLoopEnabled((v) => !v);
  }, []);

  useEffect(() => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.preload = 'auto';

    const onTimeUpdate = () => {
      const t = audio.currentTime;
      if (t > lastTimeRef.current + SEEK_TOLERANCE_SEC) {
        audio.currentTime = lastTimeRef.current;
        return;
      }
      lastTimeRef.current = t;

      const trackId = progressRef.current.lastTrackId;
      if (!trackId) return;
      const now = Date.now();
      if (now - lastSaveRef.current >= POSITION_SAVE_INTERVAL_MS) {
        lastSaveRef.current = now;
        savePosition(trackId, t);
      }
    };

    const onSeeking = () => {
      if (audio.currentTime > lastTimeRef.current + 0.35) {
        audio.currentTime = lastTimeRef.current;
      }
    };

    const onEnded = () => {
      const trackId = progressRef.current.lastTrackId;
      if (!trackId) return;

      if (loopEnabledRef.current) {
        audio.currentTime = 0;
        lastTimeRef.current = 0;
        void audio.play();
        return;
      }

      markComplete(trackId);
      const idx = playlistRef.current.findIndex((t) => t.id === trackId);
      const next = idx >= 0 ? playlistRef.current[idx + 1] : undefined;
      if (next) {
        void loadTrack(next, true);
      } else {
        setIsPlaying(false);
      }
    };

    const onPause = () => {
      const trackId = progressRef.current.lastTrackId;
      if (trackId) savePosition(trackId, audio.currentTime);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.pause();
      audio.src = '';
    };
  }, [markComplete, loadTrack, savePosition]);

  useEffect(() => {
    if (currentTrackId && !currentTrack && allItems.length > 0) {
      const stillExists = allItems.some((t) => t.id === currentTrackId);
      if (!stillExists) {
        setCurrentTrackId(null);
        setIsPlaying(false);
      }
    }
  }, [currentTrackId, currentTrack, allItems]);

  const hasPlaylistContent =
    allItems.length > 0 || hasAudioProgress(progress);

  const value = useMemo<AudioPlayerContextValue>(
    () => ({
      playlists,
      allItems,
      playlist,
      currentPlaylist,
      currentPlaylistId,
      loading,
      error,
      currentTrack,
      currentIndex,
      isPlaying,
      loopEnabled,
      progress,
      hasPlaylistContent,
      showPreview,
      setShowPreview,
      refreshPlaylist,
      selectPlaylist,
      playTrack,
      togglePlay,
      pausePlayback,
      previousTrack,
      toggleLoop,
      isTrackPlayable,
      isTrackLocked,
      isPlaylistAccessible,
      isPlaylistComplete,
      getPlaylistLockMessage,
      trackStatus,
    }),
    [
      playlists,
      allItems,
      playlist,
      currentPlaylist,
      currentPlaylistId,
      loading,
      error,
      currentTrack,
      currentIndex,
      isPlaying,
      loopEnabled,
      progress,
      hasPlaylistContent,
      showPreview,
      refreshPlaylist,
      selectPlaylist,
      playTrack,
      togglePlay,
      pausePlayback,
      previousTrack,
      toggleLoop,
      isTrackPlayable,
      isTrackLocked,
      isPlaylistAccessible,
      isPlaylistComplete,
      getPlaylistLockMessage,
      trackStatus,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  }
  return ctx;
}

export function useOptionalAudioPlayer(): AudioPlayerContextValue | null {
  return useContext(AudioPlayerContext);
}
