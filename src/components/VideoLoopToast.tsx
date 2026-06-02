import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';

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
  const hasNav = !pathname.startsWith('/admin');
  const hasPlayer = hasNav && audio?.currentTrack != null;

  if (!visible) return null;

  const className = [
    'video-loop-toast',
    hasNav && 'video-loop-toast--with-nav',
    hasPlayer && 'video-loop-toast--with-player',
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
