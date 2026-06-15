import { useEffect, useRef } from 'react';
import type { TaskMediaType } from '../types';

interface TaskAmbientMediaProps {
  url: string;
  mediaType: TaskMediaType;
  playing: boolean;
  onEnded?: () => void;
}

/**
 * Ambient background media at 40% opacity. Video is muted for browser autoplay
 * after the user clicks Start; audio plays with sound (Start is a user gesture).
 */
export function TaskAmbientMedia({
  url,
  mediaType,
  playing,
  onEnded,
}: TaskAmbientMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = mediaType === 'video' ? videoRef.current : audioRef.current;
    if (!el) return;

    if (playing) {
      const playPromise = el.play();
      if (playPromise) {
        void playPromise.catch(() => {
          if (mediaType === 'video' && videoRef.current) {
            videoRef.current.muted = true;
            void videoRef.current.play().catch(() => {});
          }
        });
      }
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [playing, url, mediaType]);

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
      audioRef.current?.pause();
    };
  }, []);

  if (mediaType === 'video') {
    return (
      <video
        ref={videoRef}
        className="task-ambient-media"
        src={url}
        playsInline
        muted
        aria-hidden
        onEnded={onEnded}
      />
    );
  }

  return (
    <audio
      ref={audioRef}
      className="task-ambient-media task-ambient-media--audio"
      src={url}
      aria-hidden
      onEnded={onEnded}
    />
  );
}
