import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';

const PATREON_URL = 'https://patreon.com/Dickalicious';

function PatreonLogo() {
  return (
    <svg
      className="patreon-bubble__logo"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M0 .48v23.04h4.22V.48zm15.385 0c-4.764 0-8.641 3.88-8.641 8.65 0 4.755 3.877 8.623 8.641 8.623 4.75 0 8.615-3.868 8.615-8.623C24 4.36 20.136.48 15.385.48z"
      />
    </svg>
  );
}

export function PatreonBubble() {
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const hasNav = !pathname.startsWith('/admin');
  const hasPlayer = hasNav && audio?.currentTrack != null;

  const className = [
    'patreon-bubble',
    hasNav && 'patreon-bubble--with-nav',
    hasPlayer && 'patreon-bubble--with-player',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      className={className}
      href={PATREON_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Support Dickalicious on Patreon"
      title="Support on Patreon"
    >
      <PatreonLogo />
    </a>
  );
}
