import { useCallback, useEffect, useState } from 'react';
import {
  adminResetMiniGameLeaderboard,
  fetchMiniGameLeaderboard,
  type MiniGameLeaderboardEntry,
  type MiniGameType,
} from '../lib/miniGameLeaderboardDb';

interface MiniGameLeaderboardProps {
  gameType: MiniGameType;
  gameId: string;
  title: string;
  userId: string | null;
  isAdmin?: boolean;
  refreshKey?: number;
}

export function MiniGameLeaderboard({
  gameType,
  gameId,
  title,
  userId,
  isAdmin = false,
  refreshKey = 0,
}: MiniGameLeaderboardProps) {
  const [entries, setEntries] = useState<MiniGameLeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<{ rank: number; bestStreak: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [localRefresh, setLocalRefresh] = useState(0);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await fetchMiniGameLeaderboard(gameType, gameId, userId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setEntries([]);
      setUserRank(null);
      return;
    }
    setEntries(result.leaderboard.entries);
    setUserRank(result.leaderboard.userRank);
  }, [gameType, gameId, userId]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard, refreshKey, localRefresh]);

  const handleResetLeaderboard = useCallback(() => {
    if (
      !window.confirm(
        `Reset the "${title}" leaderboard? All best streak records will be cleared. This cannot be undone.`,
      )
    ) {
      return;
    }
    void (async () => {
      if (resetBusy) return;
      setResetError('');
      setResetMessage('');
      setResetBusy(true);
      const result = await adminResetMiniGameLeaderboard(gameType, gameId);
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
      setLocalRefresh((key) => key + 1);
    })();
  }, [gameId, gameType, resetBusy, title]);

  const userInTop =
    userId != null && entries.some((entry) => entry.userId === userId);
  const showOutsideRank =
    userRank != null && !userInTop && userRank.bestStreak > 0;

  return (
    <article className="mini-game-leaderboard">
      <header className="mini-game-leaderboard__header">
        <div className="mini-game-leaderboard__heading">
          <h4 className="mini-game-leaderboard__title">{title}</h4>
          <span className="mini-game-leaderboard__subtitle muted">Best streak</span>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn btn--ghost btn--small mini-game-leaderboard__reset"
            onClick={handleResetLeaderboard}
            disabled={resetBusy}
          >
            {resetBusy ? 'Resetting…' : 'Reset leaderboard'}
          </button>
        )}
      </header>

      {resetError && (
        <p className="login-error mini-game-leaderboard__status" role="alert">
          {resetError}
        </p>
      )}
      {resetMessage && (
        <p className="muted mini-game-leaderboard__status" role="status">
          {resetMessage}
        </p>
      )}

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
