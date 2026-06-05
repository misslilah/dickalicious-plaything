import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useOptionalXpToast } from '../contexts/XpToastContext';
import { useVideoPlaybackActive } from '../contexts/VideoPlaybackContext';
import { useAppStore } from '../hooks/useAppStore';
import { useVideoPlaybackUrl } from '../hooks/useVideoBlobUrl';
import { createVideoWatchTracker } from '../lib/videoWatchTracker';
import { ForcedModeWarningModal } from './ForcedModeWarningModal';
import type { Video } from '../types';

const BLOCKED_KEYS = new Set([
  ' ',
  'Spacebar',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'k',
  'K',
  'j',
  'J',
  'l',
  'L',
  'f',
  'F',
  'm',
  'M',
  'p',
  'P',
]);

interface ForcedModeVideoPlayerProps {
  video: Video;
  onSessionEnd?: () => void;
}

export function ForcedModeVideoPlayer({
  video,
  onSessionEnd,
}: ForcedModeVideoPlayerProps) {
  const audio = useOptionalAudioPlayer();
  const { awardVideoCompletion, recordVideoPartialView } = useAppStore();
  const xpToast = useOptionalXpToast();
  const { url, loading, error } = useVideoPlaybackUrl(video.storagePath);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const allowNavigationRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const playbackInitRef = useRef(false);
  const watchTrackerRef = useRef(createVideoWatchTracker());
  const partialRecordedRef = useRef(false);

  const [warningOpen, setWarningOpen] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useVideoPlaybackActive(sessionActive);

  const recordPartialIfEligible = useCallback(() => {
    if (partialRecordedRef.current) return;
    const el = videoRef.current;
    if (!el) return;
    const tracker = watchTrackerRef.current;
    if (!tracker.qualifiesForPartialView(el.duration)) return;
    partialRecordedRef.current = true;
    void recordVideoPartialView(video.id, tracker.watchPercent(el.duration));
  }, [recordVideoPartialView, video.id]);

  const endSession = useCallback(() => {
    recordPartialIfEligible();
    sessionActiveRef.current = false;
    setSessionActive(false);
    setWarningOpen(false);

    const el = videoRef.current;
    if (el) {
      el.pause();
    }

    if (document.pointerLockElement) {
      void document.exitPointerLock();
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }

    onSessionEnd?.();
  }, [onSessionEnd, recordPartialIfEligible]);

  const tryEnterFullscreen = useCallback(async (target: HTMLElement) => {
    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      }
    } catch {
      // Fullscreen may be denied; overlay still blocks the app.
    }
  }, []);

  const tryPointerLock = useCallback(async (target: HTMLElement) => {
    try {
      if (document.pointerLockElement !== target) {
        await target.requestPointerLock();
      }
    } catch {
      // Pointer lock often denied without sustained gesture; best-effort only.
    }
  }, []);

  const startForcedPlayback = useCallback(() => {
    setWarningOpen(false);
    setPlayError(null);
    sessionActiveRef.current = true;
    setSessionActive(true);
  }, []);

  useEffect(() => {
    if (!sessionActive || !url) {
      playbackInitRef.current = false;
      return;
    }

    const el = videoRef.current;
    if (!el || playbackInitRef.current) return;
    playbackInitRef.current = true;

    let cancelled = false;

    const run = async () => {
      const container = containerRef.current;
      if (container) {
        await tryEnterFullscreen(container);
        await tryPointerLock(container);
      }
      if (cancelled) return;

      el.currentTime = 0;
      try {
        await el.play();
        audio?.pausePlayback();
      } catch {
        if (!cancelled) {
          setPlayError('Playback could not start. Forced Mode ended.');
          endSession();
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    sessionActive,
    url,
    tryEnterFullscreen,
    tryPointerLock,
    endSession,
    audio,
  ]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigationRef.current &&
      sessionActiveRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    allowNavigationRef.current = false;
    sessionActiveRef.current = false;
    playbackInitRef.current = false;
    watchTrackerRef.current.reset();
    partialRecordedRef.current = false;
    setWarningOpen(true);
    setSessionActive(false);
    setPlayError(null);
  }, [video.id]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const leave = window.confirm(
      'Forced Mode is active. Leave this page before the video ends?',
    );
    if (leave) {
      allowNavigationRef.current = true;
      endSession();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, endSession]);

  useEffect(() => {
    if (!sessionActive) return;

    const el = videoRef.current;
    if (!el) return;

    const tracker = watchTrackerRef.current;
    const onTimeUpdate = () => {
      tracker.onTimeUpdate(el.currentTime);
      if (partialRecordedRef.current) return;
      if (!tracker.qualifiesForPartialView(el.duration)) return;
      partialRecordedRef.current = true;
      void recordVideoPartialView(video.id, tracker.watchPercent(el.duration));
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [sessionActive, video.id, recordVideoPartialView]);

  useEffect(() => {
    if (!sessionActive) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!sessionActiveRef.current) return;
      if (BLOCKED_KEYS.has(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [sessionActive]);

  useEffect(() => {
    return () => {
      if (sessionActiveRef.current) {
        if (document.pointerLockElement) {
          void document.exitPointerLock();
        }
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
        }
      }
    };
  }, []);

  const handleVideoEnded = useCallback(() => {
    void awardVideoCompletion(video.id).then((xp) => {
      if (xp > 0) xpToast?.showXpGain(xp);
    });
    allowNavigationRef.current = true;
    endSession();
  }, [awardVideoCompletion, video.id, xpToast, endSession]);

  const handleVideoError = useCallback(() => {
    setPlayError('Video failed to load or play. Forced Mode ended.');
    allowNavigationRef.current = true;
    endSession();
  }, [endSession]);

  const handlePause = useCallback(() => {
    const el = videoRef.current;
    if (!sessionActiveRef.current || !el || el.ended) return;
    void el.play().catch(() => undefined);
  }, []);

  if (loading) {
    return <p className="muted">Loading video…</p>;
  }
  if (error || !url) {
    return <p className="login-error">{error ?? 'Video unavailable.'}</p>;
  }

  return (
    <>
      <ForcedModeWarningModal
        open={warningOpen}
        videoTitle={video.title}
        onCancel={() => {
          setWarningOpen(false);
          onSessionEnd?.();
        }}
        onContinue={() => void startForcedPlayback()}
      />

      {sessionActive && (
        <div
          className="forced-mode-overlay"
          role="presentation"
          aria-hidden={warningOpen}
        >
          <div
            ref={containerRef}
            className="forced-mode-overlay__stage"
            onClick={() => {
              if (containerRef.current) {
                void tryPointerLock(containerRef.current);
              }
            }}
          >
            <p className="forced-mode-overlay__banner" aria-live="polite">
              Forced Mode — watch until the end
            </p>
            <video
              ref={videoRef}
              className="forced-mode-overlay__video"
              src={url}
              autoPlay
              playsInline
              loop={false}
              controls={false}
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
              onPause={handlePause}
              aria-label={video.title}
            />
          </div>
        </div>
      )}

      {playError && <p className="login-error">{playError}</p>}

      {!sessionActive && !warningOpen && (
        <p className="muted">
          Forced Mode was cancelled. Select the video again to restart.
        </p>
      )}
    </>
  );
}
