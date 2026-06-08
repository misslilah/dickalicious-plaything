import { lazy, Suspense, useEffect, useState } from 'react';
import type { DailyGameAttemptStatus } from '../lib/dailyGameAttempts';
import {
  fetchFollowInstinctGame,
  type FollowInstinctGame,
} from '../lib/followInstinctGames';

const FollowInstinctGamePlayer = lazy(() =>
  import('./FollowInstinctGamePlayer').then((m) => ({
    default: m.FollowInstinctGamePlayer,
  })),
);

interface FollowInstinctGameModalProps {
  gameId: string;
  onClose: () => void;
  onAttemptStatusChange?: (status: DailyGameAttemptStatus) => void;
}

export function FollowInstinctGameModal({
  gameId,
  onClose,
  onAttemptStatusChange,
}: FollowInstinctGameModalProps) {
  const [game, setGame] = useState<FollowInstinctGame | null>(null);
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
      const result = await fetchFollowInstinctGame(gameId);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
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
      className="flash-word-game-modal follow-instinct-game-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-instinct-game-modal-title"
    >
      <div className="flash-word-game-modal__backdrop" aria-hidden="true" />
      <div className="flash-word-game-modal__panel follow-instinct-game-modal__panel">
        <header className="flash-word-game-modal__header">
          <div className="flash-word-game-modal__heading">
            <h2 id="follow-instinct-game-modal-title">
              {game?.title ?? 'Follow your instinct'}
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
          {game && (
            <Suspense fallback={<p className="muted">Loading camera game…</p>}>
              <FollowInstinctGamePlayer
                game={game}
                onAttemptStatusChange={onAttemptStatusChange}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
