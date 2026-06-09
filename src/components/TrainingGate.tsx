import { useCallback, useEffect, useRef } from 'react';
import { TRAINING_CERTIFICATION_TEXT } from '../lib/trainingAccess';

interface TrainingGateProps {
  onAccept: () => void;
  onCancel: () => void;
}

export function TrainingGate({ onAccept, onCancel }: TrainingGateProps) {
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
    onAccept();
  }, [onAccept]);

  return (
    <div
      className="training-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="training-gate-title"
      aria-describedby="training-gate-desc"
    >
      <div className="training-gate__backdrop" aria-hidden="true" />
      <div className="training-gate__panel" ref={panelRef}>
        <h2 id="training-gate-title" className="training-gate__title">
          Training certification
        </h2>
        <p id="training-gate-desc" className="training-gate__cert">
          {TRAINING_CERTIFICATION_TEXT}
        </p>
        <div className="training-gate__actions">
          <button
            type="button"
            className="btn btn--ghost training-gate__btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={acceptButtonRef}
            type="button"
            className="btn btn--primary training-gate__btn-accept"
            onClick={handleAccept}
          >
            I certify
          </button>
        </div>
      </div>
    </div>
  );
}
