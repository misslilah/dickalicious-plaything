import { useCallback, useEffect, useRef } from 'react';
import type { TaskMediaType } from '../types';

interface TaskMediaPlayerProps {
  url: string;
  mediaType: TaskMediaType;
  className?: string;
  /** Auto-play when true (e.g. after user clicks Start). */
  autoPlay?: boolean;
  onEnded?: () => void;
}

export function TaskMediaPlayer({
  url,
  mediaType,
  className,
  autoPlay = false,
  onEnded,
}: TaskMediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const maxTimeRef = useRef(0);
  const playerClass = className ?? 'task-media-player';

  useEffect(() => {
    maxTimeRef.current = 0;
  }, [url]);

  useEffect(() => {
    if (!autoPlay) return;
    const el = mediaType === 'video' ? videoRef.current : audioRef.current;
    if (!el) return;
    void el.play().catch(() => {});
  }, [autoPlay, url, mediaType]);

  const handleTimeUpdate = useCallback((event: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = event.currentTarget;
    if (el.currentTime > maxTimeRef.current) {
      maxTimeRef.current = el.currentTime;
    }
  }, []);

  const handleSeeking = useCallback((event: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = event.currentTarget;
    if (el.currentTime > maxTimeRef.current + 0.25) {
      el.currentTime = maxTimeRef.current;
    }
  }, []);

  const handleEnded = useCallback(() => {
    onEnded?.();
  }, [onEnded]);

  if (mediaType === 'video') {
    return (
      <video
        ref={videoRef}
        className={playerClass}
        src={url}
        controls
        playsInline
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onEnded={handleEnded}
      />
    );
  }

  return (
    <audio
      ref={audioRef}
      className={playerClass}
      src={url}
      controls
      preload="metadata"
      onTimeUpdate={handleTimeUpdate}
      onSeeking={handleSeeking}
      onEnded={handleEnded}
    />
  );
}
