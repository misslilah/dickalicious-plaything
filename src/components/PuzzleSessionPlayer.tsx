import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { PuzzleGamePlayer } from './PuzzleGamePlayer';
import {
  startMiniGameAttempt,
  type DailyGameAttemptStatus,
} from '../lib/dailyGameAttempts';
import {
  adminResetPuzzleLeaderboard,
  fetchPuzzleBestSolver,
  formatPuzzleSolveTime,
  upsertPuzzleBestTime,
  type PuzzleBestSolver,
} from '../lib/puzzleLeaderboardDb';
import {
  pickRandomPuzzle,
  puzzleDisplayTitle,
  type PuzzleGame,
} from '../lib/puzzleGames';

type SessionPhase = 'playing' | 'complete';

export type PuzzleSessionQuitHandler = () => void;

interface PuzzleSessionPlayerProps {
  puzzles: PuzzleGame[];
  onRegisterQuitHandler?: (handler: PuzzleSessionQuitHandler | null) => void;
  onAttemptStatusChange?: (status: DailyGameAttemptStatus) => void;
}

export function PuzzleSessionPlayer({
  puzzles,
  onRegisterQuitHandler,
  onAttemptStatusChange,
}: PuzzleSessionPlayerProps) {
  const { session } = useAppStore();
  const isAdmin = session?.role === 'admin';
  const [currentPuzzle, setCurrentPuzzle] = useState<PuzzleGame | null>(() =>
    pickRandomPuzzle(puzzles),
  );
  const [phase, setPhase] = useState<SessionPhase>('playing');
  const [lastMoveCount, setLastMoveCount] = useState(0);
  const [lastSolveTimeMs, setLastSolveTimeMs] = useState(0);
  const [bestSolver, setBestSolver] = useState<PuzzleBestSolver | null>(null);
  const [bestSolverLoading, setBestSolverLoading] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [nextError, setNextError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const loadBestSolver = useCallback(async (puzzleId: string) => {
    setBestSolverLoading(true);
    const result = await fetchPuzzleBestSolver(puzzleId);
    setBestSolverLoading(false);
    if (result.ok) {
      setBestSolver(result.bestSolver);
    }
  }, []);

  useEffect(() => {
    onRegisterQuitHandler?.(() => {});
    return () => onRegisterQuitHandler?.(null);
  }, [onRegisterQuitHandler]);

  useEffect(() => {
    if (!currentPuzzle) return;
    void loadBestSolver(currentPuzzle.id);
  }, [currentPuzzle, loadBestSolver]);

  const handlePuzzleComplete = useCallback(
    (moveCount: number, solveTimeMs: number) => {
      if (!currentPuzzle) return;
      setLastMoveCount(moveCount);
      setLastSolveTimeMs(solveTimeMs);
      setPhase('complete');
      void (async () => {
        const result = await upsertPuzzleBestTime(currentPuzzle.id, solveTimeMs);
        if (result.ok) {
          await loadBestSolver(currentPuzzle.id);
        }
      })();
    },
    [currentPuzzle, loadBestSolver],
  );

  const handleNextRandom = useCallback(() => {
    void (async () => {
      if (nextBusy) return;
      setNextError('');
      setNextBusy(true);
      const result = await startMiniGameAttempt('puzzle');
      setNextBusy(false);
      if (!result.ok) {
        setNextError(result.error);
        if (result.status) onAttemptStatusChange?.(result.status);
        return;
      }
      onAttemptStatusChange?.(result.status);
      const next = pickRandomPuzzle(puzzles, currentPuzzle?.id);
      if (!next) {
        setNextError('No puzzles available.');
        return;
      }
      setCurrentPuzzle(next);
      setPhase('playing');
      setLastMoveCount(0);
      setLastSolveTimeMs(0);
    })();
  }, [currentPuzzle?.id, nextBusy, onAttemptStatusChange, puzzles]);

  const handleResetLeaderboard = useCallback(() => {
    if (
      !window.confirm(
        'Reset all puzzle leaderboard times? This cannot be undone.',
      )
    ) {
      return;
    }
    void (async () => {
      if (resetBusy) return;
      setResetError('');
      setResetMessage('');
      setResetBusy(true);
      const result = await adminResetPuzzleLeaderboard();
      setResetBusy(false);
      if (!result.ok) {
        setResetError(result.error);
        return;
      }
      setResetMessage(
        result.deletedCount > 0
          ? `Leaderboard reset (${result.deletedCount} record${result.deletedCount === 1 ? '' : 's'} cleared).`
          : 'Leaderboard was already empty.',
      );
      setBestSolver(null);
      if (currentPuzzle) {
        await loadBestSolver(currentPuzzle.id);
      }
    })();
  }, [currentPuzzle, loadBestSolver, resetBusy]);

  if (puzzles.length === 0) {
    return <p className="muted">No puzzles available yet.</p>;
  }

  if (!currentPuzzle) {
    return <p className="muted">No puzzles available yet.</p>;
  }

  return (
    <div className="puzzle-session-player">
      <div className="puzzle-session-player__header">
        <p className="puzzle-session-player__best-solver" aria-live="polite">
          {bestSolverLoading && !bestSolver ? (
            <span className="muted">Loading best solver…</span>
          ) : bestSolver ? (
            <>
              Best solver: <strong>{bestSolver.username}</strong>
              {' — '}
              {formatPuzzleSolveTime(bestSolver.bestTimeMs)}
            </>
          ) : (
            <span className="muted">No best time yet — be the first!</span>
          )}
        </p>
        {isAdmin && (
          <button
            type="button"
            className="btn btn--ghost btn--small puzzle-session-player__reset"
            onClick={handleResetLeaderboard}
            disabled={resetBusy}
          >
            {resetBusy ? 'Resetting…' : 'Reset leaderboard'}
          </button>
        )}
      </div>

      {resetError && (
        <p className="login-error" role="alert">
          {resetError}
        </p>
      )}
      {resetMessage && (
        <p className="muted puzzle-session-player__reset-message" role="status">
          {resetMessage}
        </p>
      )}

      {phase === 'playing' && (
        <>
          <p className="muted puzzle-session-player__title">
            {puzzleDisplayTitle(currentPuzzle)}
          </p>
          <PuzzleGamePlayer
            key={currentPuzzle.id}
            puzzle={currentPuzzle}
            sessionMode
            onComplete={handlePuzzleComplete}
          />
        </>
      )}

      {phase === 'complete' && (
        <div className="puzzle-game-player__win puzzle-session-player__complete" role="status">
          <p className="puzzle-game-player__win-title">Puzzle solved!</p>
          <p className="muted">
            Completed in {formatPuzzleSolveTime(lastSolveTimeMs)} · {lastMoveCount}{' '}
            move{lastMoveCount === 1 ? '' : 's'}
          </p>
          {nextError && (
            <p className="login-error" role="alert">
              {nextError}
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleNextRandom}
              disabled={nextBusy}
            >
              {nextBusy ? 'Starting…' : 'Next random puzzle'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
