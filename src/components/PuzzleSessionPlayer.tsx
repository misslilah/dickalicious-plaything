import { useCallback, useEffect, useRef, useState } from 'react';
import { PuzzleGamePlayer } from './PuzzleGamePlayer';
import {
  PUZZLE_SESSION_STREAK_KEY,
  puzzleDisplayTitle,
  type PuzzleGame,
} from '../lib/puzzleGames';

const PUZZLE_TRANSITION_MS = 1200;

type SessionPhase = 'playing' | 'transition' | 'complete';

function writePersistedStreak(value: number): void {
  try {
    sessionStorage.setItem(PUZZLE_SESSION_STREAK_KEY, String(Math.max(0, value)));
  } catch {
    /* sessionStorage unavailable */
  }
}

export type PuzzleSessionQuitHandler = () => void;

interface PuzzleSessionPlayerProps {
  puzzles: PuzzleGame[];
  onRegisterQuitHandler?: (handler: PuzzleSessionQuitHandler | null) => void;
}

export function PuzzleSessionPlayer({
  puzzles,
  onRegisterQuitHandler,
}: PuzzleSessionPlayerProps) {
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>('playing');
  const [lastMoveCount, setLastMoveCount] = useState(0);
  const [streakAtRisk, setStreakAtRisk] = useState(true);
  const streakAtRiskRef = useRef(false);
  const streakRef = useRef(streak);
  const transitionTimerRef = useRef<number | null>(null);

  const currentPuzzle = puzzles[puzzleIndex] ?? null;
  const puzzleNumber = puzzleIndex + 1;
  const totalPuzzles = puzzles.length;

  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  useEffect(() => {
    writePersistedStreak(0);
  }, []);

  useEffect(() => {
    writePersistedStreak(streak);
  }, [streak]);

  useEffect(() => {
    if (phase === 'playing' && currentPuzzle) {
      streakAtRiskRef.current = true;
      setStreakAtRisk(true);
    }
    if (phase === 'transition' || phase === 'complete') {
      streakAtRiskRef.current = false;
      setStreakAtRisk(false);
    }
  }, [phase, currentPuzzle]);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current != null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearTransitionTimer();
  }, [clearTransitionTimer]);

  const resetStreakToZero = useCallback(() => {
    setStreak(0);
    writePersistedStreak(0);
  }, []);

  const applyQuitPenalty = useCallback(() => {
    if (!streakAtRiskRef.current) return;
    resetStreakToZero();
  }, [resetStreakToZero]);

  const applyQuitStreakRules = useCallback(() => {
    applyQuitPenalty();
    if (!streakAtRiskRef.current) {
      writePersistedStreak(streakRef.current);
    }
  }, [applyQuitPenalty]);

  useEffect(() => {
    onRegisterQuitHandler?.(applyQuitStreakRules);
    return () => onRegisterQuitHandler?.(null);
  }, [applyQuitStreakRules, onRegisterQuitHandler]);

  useEffect(() => {
    return () => {
      if (streakAtRiskRef.current) {
        writePersistedStreak(0);
      } else {
        writePersistedStreak(streakRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (streakAtRiskRef.current) {
        writePersistedStreak(0);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const advanceToNextPuzzle = useCallback(() => {
    const nextIndex = puzzleIndex + 1;
    if (nextIndex >= puzzles.length) {
      setPhase('complete');
      return;
    }
    setPuzzleIndex(nextIndex);
    setPhase('playing');
  }, [puzzleIndex, puzzles.length]);

  const handlePuzzleComplete = useCallback(
    (moveCount: number) => {
      clearTransitionTimer();
      setLastMoveCount(moveCount);
      setStreak((prev) => prev + 1);
      streakAtRiskRef.current = false;
      setStreakAtRisk(false);
      setPhase('transition');
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null;
        advanceToNextPuzzle();
      }, PUZZLE_TRANSITION_MS);
    },
    [advanceToNextPuzzle, clearTransitionTimer],
  );

  const restartSession = useCallback(() => {
    clearTransitionTimer();
    setPuzzleIndex(0);
    resetStreakToZero();
    setLastMoveCount(0);
    streakAtRiskRef.current = false;
    setStreakAtRisk(false);
    setPhase('playing');
  }, [clearTransitionTimer, resetStreakToZero]);

  if (puzzles.length === 0) {
    return (
      <p className="muted">No puzzles available yet.</p>
    );
  }

  return (
    <div className="puzzle-session-player">
      <div className="puzzle-session-player__stats">
        <span className="puzzle-session-player__streak">
          Streak: <strong>{streak}</strong>
        </span>
        <span className="muted puzzle-session-player__progress">
          Puzzle {Math.min(puzzleNumber, totalPuzzles)} of {totalPuzzles}
        </span>
      </div>

      {phase === 'playing' && currentPuzzle && (
        <>
          <p className="muted puzzle-session-player__title">
            {puzzleDisplayTitle(currentPuzzle)}
          </p>
          {streakAtRisk && (
            <p className="puzzle-session-player__quit-hint muted" aria-live="polite">
              Leaving now resets your streak.
            </p>
          )}
          <PuzzleGamePlayer
            key={currentPuzzle.id}
            puzzle={currentPuzzle}
            sessionMode
            onComplete={handlePuzzleComplete}
          />
        </>
      )}

      {phase === 'transition' && (
        <div className="puzzle-game-player__win" role="status">
          <p className="puzzle-game-player__win-title">Puzzle solved!</p>
          <p className="muted">
            Completed in {lastMoveCount} moves · Streak: {streak}
          </p>
          <p className="muted">Loading next puzzle…</p>
        </div>
      )}

      {phase === 'complete' && (
        <div className="puzzle-game-player__win puzzle-session-player__complete" role="status">
          <p className="puzzle-game-player__win-title">Session complete!</p>
          <p className="muted">
            You solved all {totalPuzzles} puzzle{totalPuzzles === 1 ? '' : 's'}.
          </p>
          <p className="puzzle-session-player__final-streak">
            Final streak: <strong>{streak}</strong>
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={restartSession}>
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
