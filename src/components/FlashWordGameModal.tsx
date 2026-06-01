import { useEffect, useState } from 'react';
import { FlashWordGamePlayer } from './FlashWordGamePlayer';
import {
  fetchFlashWordGame,
  type FlashWordGame,
} from '../lib/flashWordGames';

interface FlashWordGameModalProps {
  gameId: string;
  onClose: () => void;
}

export function FlashWordGameModal({ gameId, onClose }: FlashWordGameModalProps) {
  const [game, setGame] = useState<FlashWordGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      setGame(null);
      const result = await fetchFlashWordGame(gameId);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.game.cards.length === 0) {
        setError('This game has no flash cards configured yet.');
        return;
      }
      if (result.game.triplets.length === 0) {
        setError('This game has no word combinations configured yet.');
        return;
      }
      setGame(result.game);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  return (
    <div
      className="flash-word-game-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flash-word-game-modal-title"
    >
      <div className="flash-word-game-modal__backdrop" aria-hidden="true" />
      <div className="flash-word-game-modal__panel">
        <header className="flash-word-game-modal__header">
          <div className="flash-word-game-modal__heading">
            <h2 id="flash-word-game-modal-title">
              {game?.title ?? 'Flash Cards'}
            </h2>
            {game?.description && (
              <p className="muted flash-word-game-modal__desc">{game.description}</p>
            )}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small flash-word-game-modal__close"
            onClick={onClose}
            aria-label="Close game"
          >
            ✕
          </button>
        </header>

        <div className="flash-word-game-modal__body">
          {loading && <p className="muted">Loading game…</p>}
          {error && (
            <>
              <p className="login-error" role="alert">
                {error}
              </p>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Back to Mini Games
              </button>
            </>
          )}
          {game && <FlashWordGamePlayer game={game} />}
        </div>
      </div>
    </div>
  );
}
