import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';

export function AudioPlaylistBubble() {
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const hasNav = !pathname.startsWith('/admin');
  const hasPlayer = hasNav && audio?.currentTrack != null;
  const hasPlaylistContent = audio?.hasPlaylistContent ?? false;

  if (!hasPlaylistContent) return null;

  const className = [
    'audio-playlist-bubble',
    hasNav && 'audio-playlist-bubble--with-nav',
    hasPlayer && 'audio-playlist-bubble--with-player',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={() => audio?.setShowPreview(true)}
      aria-label="Open audio playlist preview"
      title="Audio playlist"
    >
      🎧
    </button>
  );
}
