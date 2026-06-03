import { useEffect, useState } from 'react';
import {
  fetchMiniGameLeaderboard,
  type MiniGameLeaderboardEntry,
  type MiniGameType,
} from '../lib/miniGameLeaderboardDb';

interface MiniGameLeaderboardProps {
  gameType: MiniGameType;
  gameId: string;
  title: string;
  userId: string | null;
  refreshKey?: number;
}

export function MiniGameLeaderboard({
  gameType,
  gameId,
  title,
  userId,
  refreshKey = 0,
}: MiniGameLeaderboardProps) {
  const [entries, setEntries] = useState<MiniGameLeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<{ rank: number; bestStreak: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      const result = await fetchMiniGameLeaderboard(gameType, gameId, userId);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        setEntries([]);
        setUserRank(null);
        return;
      }
      setEntries(result.leaderboard.entries);
      setUserRank(result.leaderboard.userRank);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType, gameId, userId, refreshKey]);

  const userInTop =
    userId != null && entries.some((entry) => entry.userId === userId);
  const showOutsideRank =
    userRank != null && !userInTop && userRank.bestStreak > 0;

  return (
    <article className="mini-game-leaderboard">
      <header className="mini-game-leaderboard__header">
        <h4 className="mini-game-leaderboard__title">{title}</h4>
        <span className="mini-game-leaderboard__subtitle muted">Best streak</span>
      </header>

      {loading && <p className="muted mini-game-leaderboard__status">Loading…</p>}
      {error && (
        <p className="login-error mini-game-leaderboard__status" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="muted mini-game-leaderboard__status">
          No scores yet — be the first to set a streak.
        </p>
      )}

      {!loading && !error && entries.length > 0 && (
        <ol className="mini-game-leaderboard__list">
          {entries.map((entry) => (
            <li
              key={entry.userId}
              className={[
                'mini-game-leaderboard__row',
                entry.userId === userId ? 'mini-game-leaderboard__row--you' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="mini-game-leaderboard__rank">#{entry.rank}</span>
              <span className="mini-game-leaderboard__name">{entry.username}</span>
              <span className="mini-game-leaderboard__score">{entry.bestStreak}</span>
            </li>
          ))}
        </ol>
      )}

      {showOutsideRank && (
        <p className="mini-game-leaderboard__you">
          Your rank: <strong>#{userRank.rank}</strong> — best streak{' '}
          <strong>{userRank.bestStreak}</strong>
        </p>
      )}
    </article>
  );
}
