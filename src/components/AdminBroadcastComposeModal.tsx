import { useEffect, useRef, useState, type FormEvent } from 'react';

interface AdminBroadcastComposeModalProps {
  open: boolean;
  targetLabel: string;
  targetUserId: string | null;
  onClose: () => void;
  onSend: (
    message: string,
    targetUserId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function AdminBroadcastComposeModal({
  open,
  targetLabel,
  targetUserId,
  onClose,
  onSend,
}: AdminBroadcastComposeModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMessage('');
    setError('');
    setSending(false);
    textareaRef.current?.focus();
  }, [open, targetLabel, targetUserId]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError('');
    const result = await onSend(message, targetUserId);
    setSending(false);
    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error ?? 'Failed to send message.');
  };

  return (
    <div
      className="admin-compose-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-compose-title"
    >
      <div
        className="admin-compose-modal__backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="admin-compose-modal__panel">
        <h2 id="admin-compose-title" className="admin-compose-modal__title">
          Send message
        </h2>
        <p className="admin-compose-modal__target muted">
          To: <strong>{targetLabel}</strong>
        </p>
        <form className="admin-compose-modal__form" onSubmit={handleSubmit}>
          <label className="admin-compose-modal__label" htmlFor="admin-compose-message">
            Message
          </label>
          <textarea
            id="admin-compose-message"
            ref={textareaRef}
            className="admin-compose-modal__textarea"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
            placeholder="Type your message…"
            required
          />
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <div className="admin-compose-modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={sending || !message.trim()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
