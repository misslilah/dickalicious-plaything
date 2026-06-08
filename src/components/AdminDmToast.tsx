import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { ADMIN_DM_SENDER_NAME } from '../lib/adminDirectMessages';

interface AdminDmToastProps {
  preview: string | null;
  onDismiss: () => void;
  onOpenChat: () => void;
}

export function AdminDmToast({ preview, onDismiss, onOpenChat }: AdminDmToastProps) {
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const hasNav = !pathname.startsWith('/admin');
  const hasAudioBar = hasNav && audio?.currentTrack != null;

  if (!preview) return null;

  const className = [
    'admin-dm-toast',
    hasNav && 'admin-dm-toast--with-nav',
    hasAudioBar && 'admin-dm-toast--with-player',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onOpenChat();
        onDismiss();
      }}
      aria-label={`New message from ${ADMIN_DM_SENDER_NAME}: ${preview}`}
    >
      <span className="admin-dm-toast__sender">{ADMIN_DM_SENDER_NAME}</span>
      <span className="admin-dm-toast__preview">{preview}</span>
    </button>
  );
}
