import { useEffect, useState } from 'react';
import {
  fetchMiniGameCurrentBest,
  fetchMiniGameGreatestEver,
  type MiniGameCurrentBest,
  type MiniGameGreatestEver,
  type MiniGameType,
} from '../lib/miniGameLeaderboardDb';

interface MiniGameLeaderboardHighlightsProps {
  gameType: MiniGameType;
  gameId: string;
  refreshKey?: number;
  className?: string;
}

export function MiniGameLeaderboardHighlights({
  gameType,
  gameId,
  refreshKey = 0,
  className = '',
}: MiniGameLeaderboardHighlightsProps) {
  const [currentBest, setCurrentBest] = useState<MiniGameCurrentBest | null>(null);
  const [greatestEver, setGreatestEver] = useState<MiniGameGreatestEver | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [currentResult, greatestResult] = await Promise.all([
        fetchMiniGameCurrentBest(gameType, gameId),
        fetchMiniGameGreatestEver(gameType, gameId),
      ]);
      if (cancelled) return;
      setLoading(false);
      setCurrentBest(currentResult.ok ? currentResult.currentBest : null);
      setGreatestEver(greatestResult.ok ? greatestResult.greatest : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, gameType, refreshKey]);

  if (loading && !currentBest && !greatestEver) {
    return null;
  }

  if (!currentBest && !greatestEver) {
    return null;
  }

  const showGreatestEver =
    greatestEver != null &&
    (currentBest == null ||
      greatestEver.bestStreak > currentBest.bestStreak ||
      greatestEver.username !== currentBest.username ||
      greatestEver.bestStreak !== currentBest.bestStreak);

  return (
    <div
      className={['mini-game-score-highlights', className].filter(Boolean).join(' ')}
      aria-live="polite"
    >
      {currentBest && (
        <p className="mini-game-score-highlights__current">
          Current best: <strong>{currentBest.username}</strong>
          {' — '}
          {currentBest.bestStreak}
        </p>
      )}
      {showGreatestEver && (
        <p className="mini-game-score-highlights__greatest muted">
          Greatest score ever: <strong>{greatestEver.username}</strong>
          {' — '}
          {greatestEver.bestStreak}
        </p>
      )}
    </div>
  );
}
