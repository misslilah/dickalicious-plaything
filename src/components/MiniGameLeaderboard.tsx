import { useCallback, useEffect, useState } from 'react';
import { MiniGameLeaderboardHighlights } from './MiniGameLeaderboardHighlights';
import {
  adminResetMiniGameLeaderboard,
  fetchMiniGameLeaderboard,
  type MiniGameLeaderboardEntry,
  type MiniGameType,
} from '../lib/miniGameLeaderboardDb';

const PODIUM_SIZE = 3;
const FOLLOWER_SIZE = 10;

const PODIUM_SLOTS = [
  { place: 2 as const, trophy: '🥈', label: 'Silver' },
  { place: 1 as const, trophy: '🥇', label: 'Gold' },
  { place: 3 as const, trophy: '🥉', label: 'Bronze' },
];

interface MiniGameLeaderboardProps {
  gameType: MiniGameType;
  gameId: string;
  title: string;
  userId: string | null;
  isAdmin?: boolean;
  refreshKey?: number;
}

function MiniGamePodiumPlace({
  entry,
  place,
  trophy,
  label,
  isYou,
}: {
  entry: MiniGameLeaderboardEntry | undefined;
  place: 1 | 2 | 3;
  trophy: string;
  label: string;
  isYou: boolean;
}) {
  return (
    <li
      className={[
        'mini-game-leaderboard__podium-place',
        `mini-game-leaderboard__podium-place--${place}`,
        isYou ? 'mini-game-leaderboard__podium-place--you' : '',
        !entry ? 'mini-game-leaderboard__podium-place--empty' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="mini-game-leaderboard__trophy" aria-hidden="true">
        {trophy}
      </span>
      <span className="mini-game-leaderboard__podium-medal">{label}</span>
      {entry ? (
        <>
          <span className="visually-hidden">Rank {entry.rank}</span>
          <span className="mini-game-leaderboard__podium-name">{entry.username}</span>
          <span className="mini-game-leaderboard__podium-score">{entry.bestStreak}</span>
          {isYou && <span className="mini-game-leaderboard__you-badge">You</span>}
        </>
      ) : (
        <span className="mini-game-leaderboard__podium-empty muted">Open</span>
      )}
    </li>
  );
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
        `Reset the "${title}" leaderboard? This clears current rankings but preserves the greatest score ever record.`,
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
          ? `Leaderboard reset (${result.deletedCount} record${result.deletedCount === 1 ? '' : 's'} cleared). Greatest score ever preserved.`
          : 'Leaderboard was already empty.',
      );
      setLocalRefresh((key) => key + 1);
    })();
  }, [gameId, gameType, resetBusy, title]);

  const podiumEntries = entries.slice(0, PODIUM_SIZE);
  const followerEntries = entries.slice(PODIUM_SIZE, PODIUM_SIZE + FOLLOWER_SIZE);
  const userOnBoard =
    userId != null && entries.some((entry) => entry.userId === userId);
  const showOutsideRank =
    userRank != null && !userOnBoard && userRank.bestStreak > 0;

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

      <MiniGameLeaderboardHighlights
        gameType={gameType}
        gameId={gameId}
        refreshKey={refreshKey + localRefresh}
        className="mini-game-leaderboard__highlights"
      />

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
        <>
          <ol className="mini-game-leaderboard__podium" aria-label="Podium">
            {PODIUM_SLOTS.map((slot) => {
              const entry = podiumEntries.find((item) => item.rank === slot.place);
              return (
                <MiniGamePodiumPlace
                  key={slot.place}
                  entry={entry}
                  place={slot.place}
                  trophy={slot.trophy}
                  label={slot.label}
                  isYou={entry != null && entry.userId === userId}
                />
              );
            })}
          </ol>

          {followerEntries.length > 0 && (
            <>
              <p className="mini-game-leaderboard__list-kicker">Next 10</p>
              <ol className="mini-game-leaderboard__list" start={PODIUM_SIZE + 1}>
                {followerEntries.map((entry) => (
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
            </>
          )}
        </>
      )}

      {showOutsideRank && userRank && (
        <div
          className="mini-game-leaderboard__you mini-game-leaderboard__row mini-game-leaderboard__row--you"
          role="status"
        >
          <span className="mini-game-leaderboard__rank">#{userRank.rank}</span>
          <span className="mini-game-leaderboard__name">Your rank</span>
          <span className="mini-game-leaderboard__score">{userRank.bestStreak}</span>
        </div>
      )}
    </article>
  );
}
