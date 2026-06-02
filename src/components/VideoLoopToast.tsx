import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useOptionalVideoPlayer } from '../contexts/VideoPlayerProvider';

interface VideoLoopToastProps {
  visible: boolean;
  onDismiss: () => void;
  onTurnOffLoop: () => void;
}

export function VideoLoopToast({
  visible,
  onDismiss,
  onTurnOffLoop,
}: VideoLoopToastProps) {
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const globalVideo = useOptionalVideoPlayer();
  const hasNav = !pathname.startsWith('/admin');
  const hasAudioBar = hasNav && audio?.currentTrack != null;
  const hasVideoBar = hasNav && (globalVideo?.showGlobalBar ?? false);
  const barCount = (hasAudioBar ? 1 : 0) + (hasVideoBar ? 1 : 0);

  if (!visible) return null;

  const className = [
    'video-loop-toast',
    hasNav && 'video-loop-toast--with-nav',
    barCount === 1 && 'video-loop-toast--with-player',
    barCount >= 2 && 'video-loop-toast--with-two-players',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="video-loop-toast__text">Loop is on</p>
      <div className="video-loop-toast__actions">
        <button
          type="button"
          className="video-loop-toast__link"
          onClick={onTurnOffLoop}
        >
          Turn off
        </button>
        <button
          type="button"
          className="video-loop-toast__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
