import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPuzzleSolveTime } from '../lib/puzzleLeaderboardDb';
import {
  PUZZLE_ROTATION_LABELS,
  createShuffledPuzzlePieces,
  isPuzzleSolved,
  puzzleGridSize,
  puzzlePieceBackgroundStyle,
  rotatePuzzlePiece,
  swapPuzzlePiecesAtSlots,
  type PuzzleGame,
  type PuzzlePieceState,
} from '../lib/puzzleGames';

const DRAG_THRESHOLD_PX = 8;

interface PuzzleGamePlayerProps {
  puzzle: PuzzleGame;
  /** When true, parent handles win flow (no standalone win screen). */
  sessionMode?: boolean;
  onComplete?: (moveCount: number, solveTimeMs: number) => void;
}

export function PuzzleGamePlayer({
  puzzle,
  sessionMode = false,
  onComplete,
}: PuzzleGamePlayerProps) {
  const gridSize = puzzleGridSize(puzzle.pieceCount);
  const [pieces, setPieces] = useState<PuzzlePieceState[]>(() =>
    createShuffledPuzzlePieces(puzzle.pieceCount, puzzle.rotationDirection),
  );
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [moveCount, setMoveCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; slot: number } | null>(null);
  const suppressClickRef = useRef(false);

  const piecesBySlot = useMemo(() => {
    const map = new Map<number, PuzzlePieceState>();
    for (const piece of pieces) {
      map.set(piece.slotIndex, piece);
    }
    return map;
  }, [pieces]);

  const onCompleteRef = useRef(onComplete);
  const moveCountRef = useRef(moveCount);
  const elapsedMsRef = useRef(elapsedMs);
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    moveCountRef.current = moveCount;
  }, [moveCount]);

  useEffect(() => {
    elapsedMsRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    if (won) return;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [won]);

  useEffect(() => {
    if (!isPuzzleSolved(pieces) || completedRef.current) return;
    completedRef.current = true;
    const solveTimeMs = Date.now() - startedAtRef.current;
    setElapsedMs(solveTimeMs);
    setWon(true);
    setSelectedSlot(null);
    if (sessionMode) {
      onCompleteRef.current?.(moveCountRef.current, solveTimeMs);
    }
  }, [pieces, sessionMode]);

  const resetPuzzle = useCallback(() => {
    setPieces(createShuffledPuzzlePieces(puzzle.pieceCount, puzzle.rotationDirection));
    setSelectedSlot(null);
    setWon(false);
    setMoveCount(0);
    setElapsedMs(0);
    startedAtRef.current = Date.now();
    completedRef.current = false;
    setDragSlot(null);
    setDragOverSlot(null);
    setIsDragging(false);
    dragStartRef.current = null;
  }, [puzzle.pieceCount, puzzle.rotationDirection]);

  const swapSlots = useCallback((fromSlot: number, toSlot: number) => {
    if (fromSlot === toSlot) return;
    setPieces((prev) => swapPuzzlePiecesAtSlots(prev, fromSlot, toSlot));
    setMoveCount((count) => count + 1);
    setSelectedSlot(null);
  }, []);

  const handleSlotTap = (slotIndex: number) => {
    if (won) return;

    if (selectedSlot === null) {
      setSelectedSlot(slotIndex);
      return;
    }

    if (selectedSlot === slotIndex) {
      if (puzzle.rotationDirection !== 'none') {
        const piece = piecesBySlot.get(slotIndex);
        if (piece) {
          setPieces((prev) =>
            prev.map((entry) =>
              entry.correctIndex === piece.correctIndex
                ? rotatePuzzlePiece(entry, puzzle.rotationDirection)
                : entry,
            ),
          );
          setMoveCount((count) => count + 1);
        }
      }
      setSelectedSlot(null);
      return;
    }

    swapSlots(selectedSlot, slotIndex);
  };

  const slotIndexFromPoint = (clientX: number, clientY: number): number | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const slotElement = element?.closest('[data-puzzle-slot]');
    if (!slotElement) return null;
    const value = slotElement.getAttribute('data-puzzle-slot');
    if (!value) return null;
    const slotIndex = Number.parseInt(value, 10);
    return Number.isNaN(slotIndex) ? null : slotIndex;
  };

  const endDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (dragSlot === null) return;
      const dropSlot = slotIndexFromPoint(clientX, clientY);
      if (dropSlot !== null && dropSlot !== dragSlot) {
        swapSlots(dragSlot, dropSlot);
        suppressClickRef.current = true;
      }
      setIsDragging(false);
      setDragSlot(null);
      setDragOverSlot(null);
      dragStartRef.current = null;
    },
    [dragSlot, swapSlots],
  );

  const handlePointerDown = (slotIndex: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (won || !piecesBySlot.has(slotIndex)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { x: event.clientX, y: event.clientY, slot: slotIndex };
  };

  const handlePointerMove = (slotIndex: number, event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start || start.slot !== slotIndex || won) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (!isDragging && distance >= DRAG_THRESHOLD_PX) {
      setIsDragging(true);
      setDragSlot(slotIndex);
      setSelectedSlot(null);
    }

    if (isDragging || distance >= DRAG_THRESHOLD_PX) {
      const sourceSlot = dragSlot ?? slotIndex;
      const overSlot = slotIndexFromPoint(event.clientX, event.clientY);
      setDragOverSlot(
        overSlot !== null && overSlot !== sourceSlot ? overSlot : null,
      );
    }
  };

  const handlePointerUp = (slotIndex: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (isDragging) {
      endDrag(event.clientX, event.clientY);
      return;
    }

    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start || start.slot !== slotIndex) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < DRAG_THRESHOLD_PX) {
      handleSlotTap(slotIndex);
      suppressClickRef.current = true;
    }
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
    setDragSlot(null);
    setDragOverSlot(null);
    dragStartRef.current = null;
  };

  const handleClick = (slotIndex: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (isDragging) return;
    handleSlotTap(slotIndex);
  };

  const rotationHint =
    puzzle.rotationDirection === 'none'
      ? 'Drag a piece onto another to swap, or tap one piece then another.'
      : `Drag to swap pieces. Tap to select; tap again to rotate (${PUZZLE_ROTATION_LABELS[puzzle.rotationDirection].toLowerCase()}).`;

  return (
    <div className="puzzle-game-player">
      <div className="puzzle-game-player__toolbar">
        <p className="muted puzzle-game-player__hint">{rotationHint}</p>
        <div className="puzzle-game-player__stats">
          <span className="puzzle-game-player__timer">
            {formatPuzzleSolveTime(elapsedMs)}
          </span>
          <span className="puzzle-game-player__moves">{moveCount} moves</span>
          {!sessionMode && (
            <button type="button" className="btn btn--ghost btn--small" onClick={resetPuzzle}>
              Shuffle again
            </button>
          )}
        </div>
      </div>

      <div
        className="puzzle-game-player__board"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
          aspectRatio: '1',
        }}
      >
        {Array.from({ length: puzzle.pieceCount }, (_, slotIndex) => {
          const piece = piecesBySlot.get(slotIndex);
          const isSelected = selectedSlot === slotIndex;
          const isDragSource = dragSlot === slotIndex;
          const isDropTarget = dragOverSlot === slotIndex;
          if (!piece) {
            return (
              <div
                key={slotIndex}
                data-puzzle-slot={slotIndex}
                className="puzzle-piece puzzle-piece--empty"
              />
            );
          }

          const bgStyle = puzzlePieceBackgroundStyle(
            piece.correctIndex,
            puzzle.pieceCount,
            puzzle.imageUrl,
          );

          const classNames = ['puzzle-piece'];
          if (isSelected) classNames.push('puzzle-piece--selected');
          if (isDragSource) classNames.push('puzzle-piece--dragging');
          if (isDropTarget) classNames.push('puzzle-piece--drop-target');

          return (
            <button
              key={slotIndex}
              type="button"
              data-puzzle-slot={slotIndex}
              className={classNames.join(' ')}
              aria-label={`Puzzle piece ${slotIndex + 1}`}
              aria-pressed={isSelected}
              onClick={() => handleClick(slotIndex)}
              onPointerDown={(event) => handlePointerDown(slotIndex, event)}
              onPointerMove={(event) => handlePointerMove(slotIndex, event)}
              onPointerUp={(event) => handlePointerUp(slotIndex, event)}
              onPointerCancel={handlePointerCancel}
            >
              <span
                className="puzzle-piece__image"
                style={{
                  ...bgStyle,
                  transform: `rotate(${piece.rotation}deg)`,
                }}
              />
            </button>
          );
        })}
      </div>

      {won && !sessionMode && (
        <div className="puzzle-game-player__win" role="status">
          <p className="puzzle-game-player__win-title">Puzzle solved!</p>
          <p className="muted">
            Completed in {formatPuzzleSolveTime(elapsedMs)} · {moveCount} moves.
          </p>
          <button type="button" className="btn btn--primary" onClick={resetPuzzle}>
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
