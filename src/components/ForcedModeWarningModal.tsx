interface ForcedModeWarningModalProps {
  open: boolean;
  videoTitle: string;
  onCancel: () => void;
  onContinue: () => void;
}

export function ForcedModeWarningModal({
  open,
  videoTitle,
  onCancel,
  onContinue,
}: ForcedModeWarningModalProps) {
  if (!open) return null;

  return (
    <div
      className="forced-mode-warning"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="forced-mode-warning-title"
      aria-describedby="forced-mode-warning-desc"
    >
      <div className="forced-mode-warning__backdrop" aria-hidden="true" />
      <div className="forced-mode-warning__panel">
        <h2 id="forced-mode-warning-title" className="forced-mode-warning__title">
          Forced Mode
        </h2>
        <p id="forced-mode-warning-desc" className="forced-mode-warning__desc">
          You chose Forced Mode for <strong>{videoTitle}</strong>. The app will try
          to lock your view to this video until it finishes: fullscreen, pointer
          capture on the player, and blocked in-app navigation.
        </p>
        <p className="forced-mode-warning__desc muted">
          You cannot pause or skip while it plays. OS shortcuts may still work (for
          example Alt+Tab, Win+D, or closing the browser). Confirm only if you are
          ready to watch the entire video now.
        </p>
        <div className="forced-mode-warning__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
