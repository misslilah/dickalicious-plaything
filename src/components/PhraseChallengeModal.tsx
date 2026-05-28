import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Task } from '../types';
import {
  getPhraseChallengeState,
  getPhraseRepeatCount,
  MAX_PHRASE_ERRORS,
  recordPhraseAttempt,
} from '../lib/phraseChallenge';
import { getRequiredPhrase, phraseMatches } from '../lib/taskRequirements';

interface PhraseChallengeModalProps {
  task: Task;
  open: boolean;
  onPassed: () => void;
  onFailed: (malusPoints: number) => void;
}

export function PhraseChallengeModal({
  task,
  open,
  onPassed,
  onFailed,
}: PhraseChallengeModalProps) {
  const phrase = getRequiredPhrase(task);
  const repeatCount = getPhraseRepeatCount(task);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(() => getPhraseChallengeState(task.id));

  useEffect(() => {
    if (!open) return;
    setInput('');
    setFeedback(null);
    setChallenge(getPhraseChallengeState(task.id));
    inputRef.current?.focus();
  }, [open, task.id]);

  if (!open || !phrase) return null;

  const malusPoints = task.malusPointsOnFail ?? 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (challenge.failed) return;

    const correct = phraseMatches(input, phrase);
    const result = recordPhraseAttempt(task.id, correct, repeatCount);
    setChallenge(result.state);

    if (result.failed) {
      onFailed(malusPoints);
      return;
    }

    if (result.passed) {
      onPassed();
      return;
    }

    if (correct) {
      setFeedback('Correct! Type the phrase again.');
      setInput('');
      inputRef.current?.focus();
    } else {
      const remaining = MAX_PHRASE_ERRORS - result.state.errorCount;
      setFeedback(
        remaining > 0
          ? `Incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
          : 'Incorrect.',
      );
      setInput('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="phrase-modal" role="dialog" aria-modal="true" aria-labelledby="phrase-modal-title">
      <div className="phrase-modal__backdrop" aria-hidden="true" />
      <div className="phrase-modal__panel">
        <h2 id="phrase-modal-title" className="phrase-modal__title">
          Phrase challenge
        </h2>
        <p className="phrase-modal__hint muted">
          Type the phrase exactly as shown (case-sensitive; spaces at the ends are ignored).
        </p>
        <p className="phrase-modal__target">
          <span className="phrase-modal__target-label">Phrase:</span>{' '}
          <span className="phrase-modal__target-text">{phrase}</span>
        </p>
        <p className="phrase-modal__stats" aria-live="polite">
          Correct: {challenge.correctCount}/{repeatCount} · Errors: {challenge.errorCount}/
          {MAX_PHRASE_ERRORS}
        </p>
        <form className="phrase-modal__form" onSubmit={handleSubmit}>
          <label className="phrase-modal__label" htmlFor="phrase-modal-input">
            Your answer
          </label>
          <input
            ref={inputRef}
            id="phrase-modal-input"
            type="text"
            className="phrase-modal__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={challenge.failed}
          />
          {feedback && <p className="phrase-modal__feedback">{feedback}</p>}
          <button
            type="submit"
            className="btn btn--primary phrase-modal__submit"
            disabled={!input.trim() || challenge.failed}
          >
            Submit
          </button>
        </form>
      </div>
    </div>
  );
}
