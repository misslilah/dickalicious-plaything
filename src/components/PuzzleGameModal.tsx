import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { PuzzleSessionQuitHandler } from './PuzzleSessionPlayer';
import { fetchActivePuzzleGames, type PuzzleGame } from '../lib/puzzleGames';

const PuzzleSessionPlayerLazy = lazy(() =>
  import('./PuzzleSessionPlayer').then((m) => ({
    default: m.PuzzleSessionPlayer,
  })),
);

interface PuzzleGameModalProps {
  onClose: () => void;
}

export function PuzzleGameModal({ onClose }: PuzzleGameModalProps) {
  const [puzzles, setPuzzles] = useState<PuzzleGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quitHandler, setQuitHandler] = useState<PuzzleSessionQuitHandler | null>(null);

  const handleClose = useCallback(() => {
    quitHandler?.();
    onClose();
  }, [onClose, quitHandler]);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      setPuzzles([]);
      const result = await fetchActivePuzzleGames();
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.puzzles.length === 0) {
        setError('No puzzles available yet.');
        return;
      }
      setPuzzles(result.puzzles);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="flash-word-game-modal puzzle-game-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="puzzle-game-modal-title"
    >
      <div className="flash-word-game-modal__backdrop" aria-hidden="true" />
      <div className="flash-word-game-modal__panel puzzle-game-modal__panel">
        <header className="flash-word-game-modal__header">
          <div className="flash-word-game-modal__heading">
            <h2 id="puzzle-game-modal-title">Puzzle</h2>
            <p className="muted flash-word-game-modal__desc">
              Solve puzzles in order — each win grows your streak.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small flash-word-game-modal__close"
            onClick={handleClose}
            aria-label="Close puzzle"
          >
            Close
          </button>
        </header>
        <div className="flash-word-game-modal__body puzzle-game-modal__body">
          {loading && <p className="muted">Loading puzzles…</p>}
          {error && (
            <>
              <p className="login-error" role="alert">
                {error}
              </p>
              <button type="button" className="btn btn--ghost" onClick={handleClose}>
                Back to Mini Games
              </button>
            </>
          )}
          {!loading && !error && puzzles.length > 0 && (
            <Suspense fallback={<p className="muted">Loading player…</p>}>
              <PuzzleSessionPlayerLazy
                puzzles={puzzles}
                onRegisterQuitHandler={setQuitHandler}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
