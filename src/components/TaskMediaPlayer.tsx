import type { TaskMediaType } from '../types';

interface TaskMediaPlayerProps {
  url: string;
  mediaType: TaskMediaType;
  className?: string;
}

export function TaskMediaPlayer({ url, mediaType, className }: TaskMediaPlayerProps) {
  const playerClass = className ?? 'task-media-player';

  if (mediaType === 'video') {
    return (
      <video
        className={playerClass}
        src={url}
        controls
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <audio className={playerClass} src={url} controls preload="metadata" />
  );
}
