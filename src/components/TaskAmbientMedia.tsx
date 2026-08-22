import { useEffect, useRef } from 'react';
import type { TaskMediaType } from '../types';

interface TaskAmbientMediaProps {
  url: string;
  mediaType: TaskMediaType;
  playing: boolean;
  onEnded?: () => void;
}

export function TaskAmbientMedia({
  url,
  mediaType,
  playing,
  onEnded,
}: TaskAmbientMediaProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (playing) {
      void el.play().catch(() => {});
      return;
    }
    el.pause();
  }, [playing, url]);

  if (mediaType === 'video') {
    return (
      <video
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        className="task-ambient-media"
        src={url}
        playsInline
        muted
        preload="metadata"
        onEnded={onEnded}
      />
    );
  }

  return (
    <audio
      ref={mediaRef as React.RefObject<HTMLAudioElement>}
      className="task-ambient-media task-ambient-media--audio"
      src={url}
      preload="metadata"
      onEnded={onEnded}
    />
  );
}
