import { useCallback, useEffect } from 'react';
import {
  FlashWordGamePlayer,
  type FlashWordStreakRewardPreview,
} from './FlashWordGamePlayer';
import type { FlashWordGame } from '../lib/flashWordGames';

interface FlashWordGameTestModalProps {
  game: FlashWordGame;
  cardLabel: string;
  onClose: () => void;
  previewReward?: FlashWordStreakRewardPreview;
}

export function FlashWordGameTestModal({
  game,
  cardLabel,
  onClose,
  previewReward,
}: FlashWordGameTestModalProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  const isPreview = previewReward != null;
  const title = isPreview
    ? `Preview streak ${previewReward.streakThreshold} reward`
    : `Test play — ${cardLabel}`;

  return (
    <div
      className="flash-word-game-modal flash-word-game-modal--test"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flash-word-game-test-modal-title"
    >
      <div className="flash-word-game-modal__backdrop" aria-hidden="true" />
      <div className="flash-word-game-modal__panel">
        <header className="flash-word-game-modal__header">
          <div className="flash-word-game-modal__heading">
            <h2 id="flash-word-game-test-modal-title">{title}</h2>
            <p className="flash-word-game-test-modal__sandbox muted">
              {isPreview
                ? 'Sandbox — plays the in-game streak overlay. Streak, leaderboard, and XP are not affected.'
                : 'Sandbox — streak, leaderboard, and daily limits are not affected.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small flash-word-game-modal__close"
            onClick={handleClose}
            aria-label={isPreview ? 'Close streak reward preview' : 'Close test play'}
          >
            ✕
          </button>
        </header>

        <div className="flash-word-game-modal__body">
          <FlashWordGamePlayer
            game={game}
            isTestMode
            previewReward={previewReward ?? null}
          />
        </div>
      </div>
    </div>
  );
}
