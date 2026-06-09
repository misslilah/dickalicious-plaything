import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import type { ThroneGiftToast as ThroneGiftToastState } from '../hooks/useThroneGiftRealtime';

const TOAST_MS = 4500;
const EXIT_MS = 280;

interface ThroneGiftToastProps {
  toast: ThroneGiftToastState | null;
  userId: string | undefined;
  onDismiss: () => void;
}

export function ThroneGiftToast({ toast, userId, onDismiss }: ThroneGiftToastProps) {
  const { pathname } = useLocation();
  const audio = useOptionalAudioPlayer();
  const [exiting, setExiting] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const hasNav = !pathname.startsWith('/admin');
  const hasAudioBar = hasNav && audio?.currentTrack != null;

  const dismissWithAnimation = useCallback(() => {
    if (exitTimerRef.current != null) return;
    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setExiting(false);
      onDismiss();
    }, EXIT_MS);
  }, [onDismiss]);

  useEffect(() => {
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
      setExiting(false);
    }

    if (!toast) return;

    dismissTimerRef.current = window.setTimeout(dismissWithAnimation, TOAST_MS);
    return () => {
      if (dismissTimerRef.current != null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, [toast, dismissWithAnimation]);

  if (!toast) return null;

  const isForYou = toast.matchedUserId && toast.matchedUserId === userId;

  const className = [
    'throne-gift-toast',
    hasNav && 'throne-gift-toast--with-nav',
    hasAudioBar && 'throne-gift-toast--with-player',
    isForYou && 'throne-gift-toast--verified',
    exiting && 'throne-gift-toast--exiting',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} role="status" aria-live="polite" aria-atomic="true">
      <span className="throne-gift-toast__icon" aria-hidden>
        {isForYou ? '✓' : '🎁'}
      </span>
      <p className="throne-gift-toast__message">
        {isForYou ? `Throne payment verified! ${toast.message}` : toast.message}
      </p>
      <button
        type="button"
        className="throne-gift-toast__close"
        onClick={dismissWithAnimation}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
