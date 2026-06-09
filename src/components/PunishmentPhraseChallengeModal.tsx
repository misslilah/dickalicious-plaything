import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PunishmentTemplate } from '../types';
import {
  getCurrentPunishmentPhrase,
  getPunishmentPhraseChallengeState,
  MAX_PUNISHMENT_PHRASE_ERRORS,
  recordPunishmentPhraseAttempt,
} from '../lib/punishmentPhraseChallenge';
import {
  getPhraseRepeatCount,
  getRequiredPhrases,
  phraseMatches,
} from '../lib/punishmentRequirements';

interface PunishmentPhraseChallengeModalProps {
  template: PunishmentTemplate;
  open: boolean;
  onPassed: () => void;
  onFailed: () => void;
}

export function PunishmentPhraseChallengeModal({
  template,
  open,
  onPassed,
  onFailed,
}: PunishmentPhraseChallengeModalProps) {
  const phrases = getRequiredPhrases(template);
  const repeatCount = getPhraseRepeatCount(template);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(() =>
    getPunishmentPhraseChallengeState(template.id),
  );

  const currentPhrase = getCurrentPunishmentPhrase(template, challenge);
  const phraseNumber = Math.min(challenge.phraseIndex + 1, phrases.length);

  useEffect(() => {
    if (!open) return;
    setInput('');
    setFeedback(null);
    setChallenge(getPunishmentPhraseChallengeState(template.id));
    inputRef.current?.focus();
  }, [open, template.id]);

  if (!open || phrases.length === 0 || !currentPhrase) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (challenge.failed) return;

    const correct = phraseMatches(input, currentPhrase);
    const result = recordPunishmentPhraseAttempt(template, correct);
    setChallenge(result.state);

    if (result.failed) {
      onFailed();
      return;
    }

    if (result.passed) {
      onPassed();
      return;
    }

    if (correct) {
      const nextPhrase = getCurrentPunishmentPhrase(template, result.state);
      if (nextPhrase && nextPhrase !== currentPhrase) {
        setFeedback('Correct! Next phrase.');
      } else {
        setFeedback('Correct! Type the phrase again.');
      }
      setInput('');
      inputRef.current?.focus();
    } else {
      const remaining = MAX_PUNISHMENT_PHRASE_ERRORS - result.state.errorCount;
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
    <div
      className="phrase-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="punishment-phrase-modal-title"
    >
      <div className="phrase-modal__backdrop" aria-hidden="true" />
      <div className="phrase-modal__panel">
        <h2 id="punishment-phrase-modal-title" className="phrase-modal__title">
          Phrase challenge
        </h2>
        <p className="phrase-modal__hint muted">
          Type the phrase exactly as shown (case-sensitive; spaces at the ends are
          ignored).
        </p>
        {phrases.length > 1 && (
          <p className="phrase-modal__stats muted">
            Phrase {phraseNumber} of {phrases.length}
          </p>
        )}
        <p className="phrase-modal__target">
          <span className="phrase-modal__target-label">Phrase:</span>{' '}
          <span className="phrase-modal__target-text">{currentPhrase}</span>
        </p>
        <p className="phrase-modal__stats" aria-live="polite">
          Correct: {challenge.correctCount}/{repeatCount} · Errors:{' '}
          {challenge.errorCount}/{MAX_PUNISHMENT_PHRASE_ERRORS}
        </p>
        <form className="phrase-modal__form" onSubmit={handleSubmit}>
          <label className="phrase-modal__label" htmlFor="punishment-phrase-input">
            Your answer
          </label>
          <input
            ref={inputRef}
            id="punishment-phrase-input"
            type="text"
            className="phrase-modal__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onPaste={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
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
