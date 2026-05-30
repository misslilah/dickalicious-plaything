import { useEffect, useRef, useState, type FormEvent } from 'react';

interface AdminLockCardComposeModalProps {
  open: boolean;
  targetLabel: string;
  targetUserId: string;
  onClose: () => void;
  onCreate: (
    phrase: string,
    requiredCount: number,
    targetUserId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function AdminLockCardComposeModal({
  open,
  targetLabel,
  targetUserId,
  onClose,
  onCreate,
}: AdminLockCardComposeModalProps) {
  const phraseRef = useRef<HTMLInputElement>(null);
  const [phrase, setPhrase] = useState('');
  const [repeatCount, setRepeatCount] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPhrase('');
    setRepeatCount('1');
    setError('');
    setSaving(false);
    phraseRef.current?.focus();
  }, [open, targetLabel, targetUserId]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const trimmed = phrase.trim();
    if (!trimmed) {
      setError('Phrase is required.');
      return;
    }

    const count = Math.max(1, Math.floor(Number(repeatCount) || 1));

    setSaving(true);
    setError('');
    const result = await onCreate(trimmed, count, targetUserId);
    setSaving(false);

    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error ?? 'Failed to create lock card.');
  };

  return (
    <div
      className="admin-compose-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-lock-card-title"
    >
      <div
        className="admin-compose-modal__backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="admin-compose-modal__panel">
        <h2 id="admin-lock-card-title" className="admin-compose-modal__title">
          Create lock card
        </h2>
        <p className="admin-compose-modal__target muted">
          Target: <strong>{targetLabel}</strong>
        </p>
        <p className="admin-compose-modal__target muted">
          The user will be blocked site-wide until they type the phrase{' '}
          {Math.max(1, Math.floor(Number(repeatCount) || 1))} time
          {Math.max(1, Math.floor(Number(repeatCount) || 1)) === 1 ? '' : 's'}.
        </p>
        <form className="admin-compose-modal__form" onSubmit={handleSubmit}>
          <label className="admin-compose-modal__label" htmlFor="admin-lock-phrase">
            Required phrase
          </label>
          <input
            id="admin-lock-phrase"
            ref={phraseRef}
            type="text"
            className="admin-compose-modal__input"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            disabled={saving}
            placeholder="Phrase the user must type…"
            required
          />
          <label className="admin-compose-modal__label" htmlFor="admin-lock-count">
            Repeat count
          </label>
          <input
            id="admin-lock-count"
            type="number"
            min={1}
            step={1}
            className="admin-compose-modal__input"
            value={repeatCount}
            onChange={(e) => setRepeatCount(e.target.value)}
            disabled={saving}
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
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving || !phrase.trim()}
            >
              {saving ? 'Creating…' : 'Create lock card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
