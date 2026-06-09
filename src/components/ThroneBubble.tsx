import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { getThronePageUrl } from '../lib/throne';

export function ThroneBubble() {
  const throneUrl = getThronePageUrl();
  if (!throneUrl) return null;

  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const hasNav = !pathname.startsWith('/admin');
  const hasPlayer = hasNav && audio?.currentTrack != null;

  const className = [
    'throne-bubble',
    hasNav && 'throne-bubble--with-nav',
    hasPlayer && 'throne-bubble--with-player',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      className={className}
      href={throneUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open Throne wishlist"
      title="Support on Throne"
    >
      <span className="throne-bubble__icon" aria-hidden="true">
        🎁
      </span>
    </a>
  );
}
