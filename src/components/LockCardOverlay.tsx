import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { useUserLockCard } from '../hooks/useLockCard';
import { submitLockCardPhrase } from '../lib/lockCardDb';

export function LockCardOverlay() {
  const { session } = useAppStore();
  const { lockCard, loading, refresh } = useUserLockCard(session?.userId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (!lockCard) return;
    setInput('');
    setFeedback(null);
    setCompletedCount(lockCard.completedCount);
    inputRef.current?.focus();
  }, [lockCard?.id, lockCard?.completedCount]);

  if (loading || !lockCard) return null;

  const requiredCount = lockCard.requiredCount;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !input.trim()) return;

    setSubmitting(true);
    setFeedback(null);
    const result = await submitLockCardPhrase(lockCard.id, input);
    setSubmitting(false);

    if (!result.ok) {
      setFeedback(result.error);
      setInput('');
      inputRef.current?.focus();
      return;
    }

    setCompletedCount(result.completedCount);

    if (result.cleared) {
      await refresh();
      return;
    }

    if (result.correct) {
      setFeedback('Correct! Type the phrase again.');
    } else {
      setFeedback('Incorrect. Try again.');
    }
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div
      className="lock-card-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-card-title"
    >
      <div className="lock-card-overlay__backdrop" aria-hidden="true" />
      <div className="lock-card-overlay__panel">
        <div className="lock-card-overlay__icon" aria-hidden>
          🔒
        </div>
        <h2 id="lock-card-title" className="lock-card-overlay__title">
          Lock card
        </h2>
        <p className="lock-card-overlay__hint muted">
          The site is locked until you type the required phrase correctly. Match
          it exactly (case-sensitive; spaces at the ends are ignored).
        </p>
        <p className="lock-card-overlay__target">
          <span className="lock-card-overlay__target-label">Phrase:</span>{' '}
          <span className="lock-card-overlay__target-text">{lockCard.phrase}</span>
        </p>
        <p className="lock-card-overlay__progress" aria-live="polite">
          Progress: {completedCount} / {requiredCount}
        </p>
        <div
          className="lock-card-overlay__progress-bar"
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={requiredCount}
        >
          <div
            className="lock-card-overlay__progress-fill"
            style={{ width: `${Math.min(100, (completedCount / requiredCount) * 100)}%` }}
          />
        </div>
        <form className="lock-card-overlay__form" onSubmit={handleSubmit}>
          <label className="lock-card-overlay__label" htmlFor="lock-card-input">
            Your answer
          </label>
          <input
            ref={inputRef}
            id="lock-card-input"
            type="text"
            className="lock-card-overlay__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
          />
          {feedback && (
            <p className="lock-card-overlay__feedback" role="status">
              {feedback}
            </p>
          )}
          <button
            type="submit"
            className="btn btn--primary lock-card-overlay__submit"
            disabled={!input.trim() || submitting}
          >
            {submitting ? 'Checking…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
