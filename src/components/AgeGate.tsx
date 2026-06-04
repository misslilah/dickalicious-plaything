import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export const AGE_VERIFIED_STORAGE_KEY = 'age-verified-v1';

function readAgeVerified(): boolean {
  try {
    return localStorage.getItem(AGE_VERIFIED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistAgeVerified(): void {
  try {
    localStorage.setItem(AGE_VERIFIED_STORAGE_KEY, 'true');
  } catch {
    /* private mode / blocked storage */
  }
}

type GateStatus = 'checking' | 'pending' | 'verified';

interface AgeGateProps {
  children: ReactNode;
}

export function AgeGate({ children }: AgeGateProps) {
  const [status, setStatus] = useState<GateStatus>('checking');
  const panelRef = useRef<HTMLDivElement>(null);
  const yesButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setStatus(readAgeVerified() ? 'verified' : 'pending');
  }, []);

  useEffect(() => {
    if (status !== 'pending') return;
    yesButtonRef.current?.focus();
    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [status]);

  const handleYes = useCallback(() => {
    persistAgeVerified();
    setStatus('verified');
  }, []);

  const handleNo = useCallback(() => {
    window.location.href = 'https://www.google.com';
  }, []);

  if (status === 'checking' || status === 'pending') {
    return (
      <div
        className="age-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        aria-describedby="age-gate-desc"
      >
        <div className="age-gate__backdrop" aria-hidden="true" />
        <div className="age-gate__panel" ref={panelRef}>
          <h1 id="age-gate-title" className="age-gate__title">
            Adults only (18+)
          </h1>
          <p id="age-gate-desc" className="age-gate__desc">
            This site is intended for adults only (18+). By entering, you confirm
            you are at least 18 years old. Are you sure you want to continue?
          </p>
          <div className="age-gate__actions">
            <button
              type="button"
              className="btn btn--ghost age-gate__btn-no"
              onClick={handleNo}
            >
              No
            </button>
            <button
              ref={yesButtonRef}
              type="button"
              className="btn btn--primary age-gate__btn-yes"
              onClick={handleYes}
            >
              Yes, I am 18+
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
