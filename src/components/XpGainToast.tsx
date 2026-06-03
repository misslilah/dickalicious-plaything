import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';

const AUTO_DISMISS_MS = 3000;

interface XpGainToastProps {
  amount: number | null;
  onDismiss: () => void;
}

export function XpGainToast({ amount, onDismiss }: XpGainToastProps) {
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const hasNav = !pathname.startsWith('/admin');
  const hasAudioBar = hasNav && audio?.currentTrack != null;

  useEffect(() => {
    if (amount == null) return;
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [amount, onDismiss]);

  if (amount == null) return null;

  const className = [
    'xp-gain-toast',
    hasNav && 'xp-gain-toast--with-nav',
    hasAudioBar && 'xp-gain-toast--with-player',
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
      <p className="xp-gain-toast__text">+{amount} XP</p>
    </div>
  );
}
