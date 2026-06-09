import { useEffect } from 'react';
import type { ThroneGiftToast as ThroneGiftToastState } from '../hooks/useThroneGiftRealtime';

interface ThroneGiftToastProps {
  toast: ThroneGiftToastState | null;
  userId: string | undefined;
  onDismiss: () => void;
}

export function ThroneGiftToast({ toast, userId, onDismiss }: ThroneGiftToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isForYou = toast.matchedUserId && toast.matchedUserId === userId;

  return (
    <div
      className={`throne-gift-toast${isForYou ? ' throne-gift-toast--verified' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="throne-gift-toast__icon" aria-hidden>
        {isForYou ? '✓' : '🎁'}
      </span>
      <p className="throne-gift-toast__message">
        {isForYou ? `Throne payment verified! ${toast.message}` : toast.message}
      </p>
      <button
        type="button"
        className="throne-gift-toast__close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
