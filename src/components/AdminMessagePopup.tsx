interface AdminMessagePopupProps {
  message: string;
  onDismiss: () => void;
}

export function AdminMessagePopup({ message, onDismiss }: AdminMessagePopupProps) {
  return (
    <div
      className="admin-message-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="admin-message-title"
      aria-describedby="admin-message-body"
    >
      <div className="admin-message-modal__backdrop" aria-hidden="true" />
      <div className="admin-message-modal__panel">
        <h2 id="admin-message-title" className="admin-message-modal__title">
          Message from admin
        </h2>
        <p id="admin-message-body" className="admin-message-modal__body">
          {message}
        </p>
        <button
          type="button"
          className="btn btn--primary admin-message-modal__ok"
          onClick={onDismiss}
        >
          OK
        </button>
      </div>
    </div>
  );
}
