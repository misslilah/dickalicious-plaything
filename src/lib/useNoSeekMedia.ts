import { useCallback, useEffect, useRef, type RefObject } from 'react';

const SEEK_TOLERANCE_SEC = 1.25;

/** Prevents forward seeking on a native video/audio element (matches playlist player). */
export function useNoSeekMedia(
  mediaRef: RefObject<HTMLMediaElement | null>,
  enabled: boolean,
) {
  const lastTimeRef = useRef(0);

  const resetPosition = useCallback(() => {
    lastTimeRef.current = 0;
    const el = mediaRef.current;
    if (el) el.currentTime = 0;
  }, [mediaRef]);

  useEffect(() => {
    if (!enabled) return;
    const el = mediaRef.current;
    if (!el) return;

    lastTimeRef.current = 0;

    const onTimeUpdate = () => {
      const t = el.currentTime;
      if (t > lastTimeRef.current + SEEK_TOLERANCE_SEC) {
        el.currentTime = lastTimeRef.current;
        return;
      }
      lastTimeRef.current = t;
    };

    const onSeeking = () => {
      if (el.currentTime > lastTimeRef.current + 0.35) {
        el.currentTime = lastTimeRef.current;
      }
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('seeking', onSeeking);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('seeking', onSeeking);
    };
  }, [enabled, mediaRef]);

  return { resetPosition };
}
