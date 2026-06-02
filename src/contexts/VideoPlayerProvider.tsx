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
import { useOptionalAudioPlayer } from './AudioPlayerProvider';
import { useVideoPlaybackActive } from './VideoPlaybackContext';
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

interface VideoPlayerContextValue {
  session: NormalVideoSession | null;
  url: string | null;
  loading: boolean;
  error: string | null;
  isPlaying: boolean;
  loop: boolean;
  showLoopNotice: boolean;
  showGlobalBar: boolean;
  startNormalPlayback: (video: Video, categoryId: string) => void;
  clearNormalPlayback: () => void;
  togglePlay: () => void;
  toggleLoop: () => void;
  dismissLoopNotice: () => void;
  turnOffLoop: () => void;
  registerInlineHost: (el: HTMLElement | null) => void;
}

const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const audio = useOptionalAudioPlayer();
  const [session, setSession] = useState<NormalVideoSession | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showLoopNotice, setShowLoopNotice] = useState(false);
  const [inlineHost, setInlineHost] = useState<HTMLElement | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackHostRef = useRef<HTMLDivElement | null>(null);
  const loopNoticeShownRef = useRef(false);
  const shouldAutoplayRef = useRef(false);

  const showGlobalBar = session != null && inlineHost == null;

  useVideoPlaybackActive(session != null);

  const clearNormalPlayback = useCallback(() => {
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setSession(null);
    setUrl(null);
    setLoading(false);
    setError(null);
    setIsPlaying(false);
    setShowLoopNotice(false);
    loopNoticeShownRef.current = false;
  }, []);

  const startNormalPlayback = useCallback(
    (video: Video, categoryId: string) => {
      if (
        session?.videoId === video.id &&
        session.categoryId === categoryId &&
        url
      ) {
        return;
      }

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
      setIsPlaying(false);
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
      void el.play().catch(() => setIsPlaying(false));
    }
  }, [url, session?.videoId, inlineHost]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.loop = loop;
  }, [loop]);

  const onVideoPlay = useCallback(() => {
    audio?.pausePlayback();
    setIsPlaying(true);
  }, [audio]);

  const onVideoPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => setIsPlaying(false));
    } else {
      el.pause();
    }
  }, []);

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
      onPause={onVideoPause}
    />
  ) : null;

  const value = useMemo<VideoPlayerContextValue>(
    () => ({
      session,
      url,
      loading,
      error,
      isPlaying,
      loop,
      showLoopNotice,
      showGlobalBar,
      startNormalPlayback,
      clearNormalPlayback,
      togglePlay,
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
      isPlaying,
      loop,
      showLoopNotice,
      showGlobalBar,
      startNormalPlayback,
      clearNormalPlayback,
      togglePlay,
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
