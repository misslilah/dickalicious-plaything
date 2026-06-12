import { useCallback, useEffect } from 'react';
import { FlashWordGamePlayer } from './FlashWordGamePlayer';
import type { FlashWordGame } from '../lib/flashWordGames';

interface FlashWordGameTestModalProps {
  game: FlashWordGame;
  cardLabel: string;
  onClose: () => void;
}

export function FlashWordGameTestModal({
  game,
  cardLabel,
  onClose,
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
            <h2 id="flash-word-game-test-modal-title">Test play — {cardLabel}</h2>
            <p className="flash-word-game-test-modal__sandbox muted">
              Sandbox — streak, leaderboard, and daily limits are not affected.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small flash-word-game-modal__close"
            onClick={handleClose}
            aria-label="Close test play"
          >
            ✕
          </button>
        </header>

        <div className="flash-word-game-modal__body">
          <FlashWordGamePlayer game={game} isTestMode />
        </div>
      </div>
    </div>
  );
}
