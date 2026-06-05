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
import { createPortal } from 'react-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useOptionalAudioPlayer } from './AudioPlayerProvider';
import { useOptionalXpToast } from './XpToastContext';
import { useVideoPlaybackActive } from './VideoPlaybackContext';
import { createVideoWatchTracker } from '../lib/videoWatchTracker';
import { getVideoPlaybackUrl } from '../lib/videoStorage';
import {
  readVideoLoopPreference,
  writeVideoLoopPreference,
} from '../lib/videoLoopPreference';
import type { Video } from '../types';

export interface NormalVideoSession {
  videoId: string;
  categoryId: string;
  title: string;
  storagePath: string;
  autoLoop: boolean;
}

export interface VideoPlaylistPlaybackEntry {
  video: Video;
  categoryId: string;
}

export interface VideoPlaylistPlaybackState {
  playlistId: string;
  title: string;
  entries: VideoPlaylistPlaybackEntry[];
  index: number;
}

interface VideoPlayerContextValue {
  session: NormalVideoSession | null;
  url: string | null;
  loading: boolean;
  error: string | null;
  loop: boolean;
  showLoopNotice: boolean;
  playlistPlayback: VideoPlaylistPlaybackState | null;
  playlistProgress: { current: number; total: number } | null;
  startNormalPlayback: (video: Video, categoryId: string) => void;
  startPlaylistPlayback: (state: VideoPlaylistPlaybackState) => void;
  exitPlaylistPlayback: () => void;
  clearNormalPlayback: () => void;
  toggleLoop: () => void;
  dismissLoopNotice: () => void;
  turnOffLoop: () => void;
  registerInlineHost: (el: HTMLElement | null) => void;
}

const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const audio = useOptionalAudioPlayer();
  const { awardVideoCompletion, recordVideoPartialView } = useAppStore();
  const xpToast = useOptionalXpToast();
  const [session, setSession] = useState<NormalVideoSession | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [showLoopNotice, setShowLoopNotice] = useState(false);
  const [inlineHost, setInlineHost] = useState<HTMLElement | null>(null);
  const [playlistPlayback, setPlaylistPlayback] =
    useState<VideoPlaylistPlaybackState | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playlistPlaybackRef = useRef<VideoPlaylistPlaybackState | null>(null);
  const fallbackHostRef = useRef<HTMLDivElement | null>(null);
  const loopNoticeShownRef = useRef(false);
  const shouldAutoplayRef = useRef(false);
  const watchTrackerRef = useRef(createVideoWatchTracker());
  const partialRecordedRef = useRef(false);
  const sessionVideoIdRef = useRef<string | null>(null);
  sessionVideoIdRef.current = session?.videoId ?? null;

  const [normalVideoPlaying, setNormalVideoPlaying] = useState(false);

  useVideoPlaybackActive(session != null && normalVideoPlaying);

  useEffect(() => {
    playlistPlaybackRef.current = playlistPlayback;
  }, [playlistPlayback]);

  const flushPartialForVideo = useCallback(
    (videoId: string | null | undefined) => {
      if (!videoId || partialRecordedRef.current) return;
      const el = videoRef.current;
      if (!el) return;
      const tracker = watchTrackerRef.current;
      tracker.onTimeUpdate(el.currentTime);
      if (!tracker.qualifiesForPartialView(el.duration)) return;
      partialRecordedRef.current = true;
      void recordVideoPartialView(videoId, tracker.watchPercent(el.duration));
    },
    [recordVideoPartialView],
  );

  const flushPartialIfEligible = useCallback(() => {
    flushPartialForVideo(sessionVideoIdRef.current);
  }, [flushPartialForVideo]);

  const clearNormalPlayback = useCallback(() => {
    flushPartialIfEligible();
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setNormalVideoPlaying(false);
    setPlaylistPlayback(null);
    setSession(null);
    setUrl(null);
    setLoading(false);
    setError(null);
    setShowLoopNotice(false);
    loopNoticeShownRef.current = false;
  }, [flushPartialIfEligible]);

  const exitPlaylistPlayback = useCallback(() => {
    setPlaylistPlayback(null);
    clearNormalPlayback();
  }, [clearNormalPlayback]);

  const playPlaylistEntry = useCallback(
    (state: VideoPlaylistPlaybackState, index: number) => {
      const entry = state.entries[index];
      if (!entry) return;

      const autoLoop = entry.video.autoLoop ?? false;
      const initialLoop = false;
      loopNoticeShownRef.current = false;
      setShowLoopNotice(false);
      setLoop(initialLoop);
      shouldAutoplayRef.current = true;
      setPlaylistPlayback({ ...state, index });
      setSession({
        videoId: entry.video.id,
        categoryId: entry.categoryId,
        title: entry.video.title,
        storagePath: entry.video.storagePath,
        autoLoop,
      });
      setUrl(null);
      setError(null);
      setLoading(true);
    },
    [],
  );

  const startPlaylistPlayback = useCallback(
    (state: VideoPlaylistPlaybackState) => {
      if (state.entries.length === 0) return;
      playPlaylistEntry(state, 0);
    },
    [playPlaylistEntry],
  );

  const startNormalPlayback = useCallback(
    (video: Video, categoryId: string) => {
      if (
        session?.videoId === video.id &&
        session.categoryId === categoryId &&
        url &&
        !playlistPlaybackRef.current
      ) {
        return;
      }

      setPlaylistPlayback(null);

      const autoLoop = video.autoLoop ?? false;
      const initialLoop = autoLoop ? true : readVideoLoopPreference();
      loopNoticeShownRef.current = false;
      setShowLoopNotice(false);
      setLoop(initialLoop);
      shouldAutoplayRef.current = true;
      setSession({
        videoId: video.id,
        categoryId,
        title: video.title,
        storagePath: video.storagePath,
        autoLoop,
      });
      setUrl(null);
      setError(null);
      setLoading(true);
    },
    [session, url],
  );

  useEffect(() => {
    if (!session?.storagePath) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getVideoPlaybackUrl(session.storagePath)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setUrl(null);
          return;
        }
        setUrl(result.url);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load video.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.videoId, session?.storagePath]);

  useEffect(() => {
    if (!session?.autoLoop || !loop || loopNoticeShownRef.current) return;
    loopNoticeShownRef.current = true;
    setShowLoopNotice(true);
  }, [session?.autoLoop, session?.videoId, loop]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    if (el.src !== url) {
      el.src = url;
      el.load();
    }
    if (shouldAutoplayRef.current) {
      shouldAutoplayRef.current = false;
      void el.play().catch(() => {});
    }
  }, [url, session?.videoId, inlineHost]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !session || !url) {
      setNormalVideoPlaying(false);
      return;
    }

    const syncPlaying = () => setNormalVideoPlaying(!el.paused && !el.ended);
    syncPlaying();
    el.addEventListener('play', syncPlaying);
    el.addEventListener('pause', syncPlaying);
    el.addEventListener('ended', syncPlaying);
    return () => {
      el.removeEventListener('play', syncPlaying);
      el.removeEventListener('pause', syncPlaying);
      el.removeEventListener('ended', syncPlaying);
    };
  }, [session?.videoId, url]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.loop = loop;
  }, [loop]);

  useEffect(() => {
    const videoId = session?.videoId;
    return () => {
      flushPartialForVideo(videoId);
    };
  }, [session?.videoId, flushPartialForVideo]);

  useEffect(() => {
    watchTrackerRef.current.reset();
    partialRecordedRef.current = false;
  }, [session?.videoId]);

  useEffect(() => {
    const el = videoRef.current;
    const videoId = session?.videoId;
    if (!el || !videoId || !url) return;

    const tracker = watchTrackerRef.current;
    const onTimeUpdate = () => {
      tracker.onTimeUpdate(el.currentTime);
      flushPartialForVideo(videoId);
    };
    const onSeeking = () => tracker.onSeeking(el.currentTime);
    const onEnded = () => {
      const playlist = playlistPlaybackRef.current;
      if (playlist && !el.loop) {
        const nextIndex = playlist.index + 1;
        if (nextIndex < playlist.entries.length) {
          playPlaylistEntry(playlist, nextIndex);
        } else {
          setPlaylistPlayback(null);
        }
      }

      if (!tracker.qualifiesForReward(el.duration, 'normal')) return;
      void awardVideoCompletion(videoId).then((xp) => {
        if (xp > 0) xpToast?.showXpGain(xp);
      });
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('seeking', onSeeking);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('seeking', onSeeking);
      el.removeEventListener('ended', onEnded);
    };
  }, [
    session?.videoId,
    url,
    awardVideoCompletion,
    flushPartialForVideo,
    xpToast,
    playPlaylistEntry,
  ]);

  const onVideoPlay = useCallback(() => {
    audio?.pausePlayback();
  }, [audio]);

  const toggleLoop = useCallback(() => {
    setLoop((prev) => {
      const next = !prev;
      writeVideoLoopPreference(next);
      if (!next) setShowLoopNotice(false);
      return next;
    });
  }, []);

  const dismissLoopNotice = useCallback(() => {
    setShowLoopNotice(false);
  }, []);

  const turnOffLoop = useCallback(() => {
    setLoop(false);
    writeVideoLoopPreference(false);
    setShowLoopNotice(false);
  }, []);

  const registerInlineHost = useCallback((el: HTMLElement | null) => {
    setInlineHost(el);
  }, []);

  const mountTarget = inlineHost ?? fallbackHostRef.current;

  const videoElement = session && url ? (
    <video
      ref={videoRef}
      className="video-player"
      controls
      controlsList="nodownload"
      disablePictureInPicture
      loop={loop}
      preload="metadata"
      aria-label={session.title}
      onPlay={onVideoPlay}
    />
  ) : null;

  const playlistProgress = useMemo(() => {
    if (!playlistPlayback || playlistPlayback.entries.length === 0) return null;
    return {
      current: playlistPlayback.index + 1,
      total: playlistPlayback.entries.length,
    };
  }, [playlistPlayback]);

  const value = useMemo<VideoPlayerContextValue>(
    () => ({
      session,
      url,
      loading,
      error,
      loop,
      showLoopNotice,
      playlistPlayback,
      playlistProgress,
      startNormalPlayback,
      startPlaylistPlayback,
      exitPlaylistPlayback,
      clearNormalPlayback,
      toggleLoop,
      dismissLoopNotice,
      turnOffLoop,
      registerInlineHost,
    }),
    [
      session,
      url,
      loading,
      error,
      loop,
      showLoopNotice,
      playlistPlayback,
      playlistProgress,
      startNormalPlayback,
      startPlaylistPlayback,
      exitPlaylistPlayback,
      clearNormalPlayback,
      toggleLoop,
      dismissLoopNotice,
      turnOffLoop,
      registerInlineHost,
    ],
  );

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
      <div
        ref={fallbackHostRef}
        className="video-player-fallback-host"
        aria-hidden={inlineHost != null}
      />
      {mountTarget && videoElement
        ? createPortal(videoElement, mountTarget)
        : null}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayer(): VideoPlayerContextValue {
  const ctx = useContext(VideoPlayerContext);
  if (!ctx) {
    throw new Error('useVideoPlayer must be used within VideoPlayerProvider');
  }
  return ctx;
}

export function useOptionalVideoPlayer(): VideoPlayerContextValue | null {
  return useContext(VideoPlayerContext);
}
