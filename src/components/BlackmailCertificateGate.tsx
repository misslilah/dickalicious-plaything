import { useCallback, useEffect, useRef } from 'react';
import {
  BLACKMAIL_CERTIFICATION_FINE_PRINT,
  BLACKMAIL_CERTIFICATION_TEXT,
} from '../lib/trainingAccess';

interface BlackmailCertificateGateProps {
  onAccept: () => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

export function BlackmailCertificateGate({
  onAccept,
  onCancel,
  loading = false,
  error = null,
}: BlackmailCertificateGateProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acceptButtonRef.current?.focus();
    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const handleAccept = useCallback(() => {
    if (!loading) onAccept();
  }, [loading, onAccept]);

  return (
    <div
      className="training-gate training-gate--blackmail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blackmail-gate-title"
      aria-describedby="blackmail-gate-desc"
    >
      <div className="training-gate__backdrop" aria-hidden="true" />
      <div className="training-gate__panel" ref={panelRef}>
        <h2 id="blackmail-gate-title" className="training-gate__title">
          Blackmail opt-in certificate
        </h2>
        <p id="blackmail-gate-desc" className="training-gate__cert">
          {BLACKMAIL_CERTIFICATION_TEXT}
        </p>
        <p className="training-gate__fine-print">{BLACKMAIL_CERTIFICATION_FINE_PRINT}</p>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <div className="training-gate__actions">
          <button
            type="button"
            className="btn btn--ghost training-gate__btn-cancel"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            ref={acceptButtonRef}
            type="button"
            className="btn btn--primary training-gate__btn-accept"
            onClick={handleAccept}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'I certify'}
          </button>
        </div>
      </div>
    </div>
  );
}
