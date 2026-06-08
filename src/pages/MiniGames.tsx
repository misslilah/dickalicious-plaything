import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlashWordGameModal } from '../components/FlashWordGameModal';
import { FollowInstinctGameModal } from '../components/FollowInstinctGameModal';
import { PuzzleGameModal } from '../components/PuzzleGameModal';
import { MiniGameLeaderboard } from '../components/MiniGameLeaderboard';
import { useAppStore } from '../hooks/useAppStore';
import {
  dailyGameAttemptRemainingLabel,
  dailyGameAttemptShouldShowUpgradeHint,
  fetchAllDailyGameAttemptStatuses,
  startMiniGameAttempt,
  type DailyGameAttemptStatus,
  type DailyGameType,
} from '../lib/dailyGameAttempts';
import { getPatreonPageUrl } from '../lib/patreon';
import {
  fetchFlashWordGameSummaries,
  type FlashWordGameSummary,
} from '../lib/flashWordGames';
import {
  fetchFollowInstinctGameSummaries,
  type FollowInstinctGameSummary,
} from '../lib/followInstinctGames';
import {
  fetchPuzzleGameSummaries,
  PUZZLE_SESSION_STREAK_KEY,
  type PuzzleGameSummary,
} from '../lib/puzzleGames';

type ActiveGame =
  | { type: 'flash'; id: string }
  | { type: 'instinct'; id: string }
  | { type: 'puzzle' }
  | null;

const GAME_TYPE_BY_ACTIVE: Record<NonNullable<ActiveGame>['type'], DailyGameType> = {
  flash: 'flash_cards',
  instinct: 'follow_instinct',
  puzzle: 'puzzle',
};

export function MiniGames() {
  const { session } = useAppStore();
  const [flashGames, setFlashGames] = useState<FlashWordGameSummary[]>([]);
  const [instinctGames, setInstinctGames] = useState<FollowInstinctGameSummary[]>([]);
  const [puzzleGames, setPuzzleGames] = useState<PuzzleGameSummary[]>([]);
  const [attemptStatuses, setAttemptStatuses] = useState<
    Record<DailyGameType, DailyGameAttemptStatus> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGame, setActiveGame] = useState<ActiveGame>(null);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);
  const [playBusy, setPlayBusy] = useState<DailyGameType | null>(null);
  const [playError, setPlayError] = useState('');

  const closeActiveGame = () => {
    setActiveGame(null);
    setLeaderboardRefresh((tick) => tick + 1);
    void refreshAttemptStatuses();
  };

  const refreshAttemptStatuses = useCallback(async () => {
    const result = await fetchAllDailyGameAttemptStatuses();
    if (result.ok) {
      setAttemptStatuses(result.statuses);
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(PUZZLE_SESSION_STREAK_KEY);
      } catch {
        /* sessionStorage unavailable */
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      const [flashResult, instinctResult, puzzleResult, attemptsResult] = await Promise.all([
        fetchFlashWordGameSummaries(),
        fetchFollowInstinctGameSummaries(),
        fetchPuzzleGameSummaries(),
        fetchAllDailyGameAttemptStatuses(),
      ]);
      if (cancelled) return;
      setLoading(false);
      const errors: string[] = [];
      if (!flashResult.ok) errors.push(flashResult.error);
      else setFlashGames(flashResult.games);
      if (!instinctResult.ok) errors.push(instinctResult.error);
      else setInstinctGames(instinctResult.games);
      if (!puzzleResult.ok) errors.push(puzzleResult.error);
      else setPuzzleGames(puzzleResult.puzzles);
      if (attemptsResult.ok) {
        setAttemptStatuses(attemptsResult.statuses);
      }
      if (errors.length === 3) setError(errors.join(' '));
      else if (errors.length === 1) setError(errors[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  const handlePlay = async (game: NonNullable<ActiveGame>) => {
    const gameType = GAME_TYPE_BY_ACTIVE[game.type];
    setPlayError('');
    setPlayBusy(gameType);
    const result = await startMiniGameAttempt(gameType);
    setPlayBusy(null);
    if (!result.ok) {
      setPlayError(result.error);
      if (result.status) {
        setAttemptStatuses((prev) =>
          prev ? { ...prev, [gameType]: result.status! } : prev,
        );
      }
      return;
    }
    setAttemptStatuses((prev) =>
      prev ? { ...prev, [gameType]: result.status } : prev,
    );
    setActiveGame(game);
  };

  const patreonUrl = getPatreonPageUrl();

  const renderAttemptMeta = (gameType: DailyGameType) => {
    const status = attemptStatuses?.[gameType];
    if (!status) {
      if (loading) {
        return <p className="muted mini-game-card__meta">Loading play limit…</p>;
      }
      return null;
    }

    const counterLabel = dailyGameAttemptRemainingLabel(status);
    const isFree = status.limit === 0;
    const atLimit = !status.canPlay && !isFree && !status.unlimited;
    const showUpgradeHint = dailyGameAttemptShouldShowUpgradeHint(status);

    return (
      <div className="mini-game-card__attempt-meta">
        {counterLabel && (
          <p
            className={`mini-game-card__meta${atLimit ? ' login-error' : ' muted'}`}
          >
            {counterLabel}
          </p>
        )}

        {isFree && (
          <p className="mini-game-card__meta login-error" role="alert">
            Mini games require an active Patreon membership.{' '}
            <Link to="/settings">Connect Patreon in Settings</Link> to play.
          </p>
        )}

        {atLimit && status.limit === 3 && (
          <p className="mini-game-card__meta login-error" role="alert">
            Daily limit reached ({status.used}/{status.limit}). Upgrade to{' '}
            <strong>Princess</strong> (15/day) or <strong>Slut</strong> (unlimited) on{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>{' '}
            to play more, or check <Link to="/settings">Settings</Link>.
          </p>
        )}

        {atLimit && status.limit === 15 && (
          <p className="mini-game-card__meta login-error" role="alert">
            Daily limit reached ({status.used}/{status.limit}). Upgrade to{' '}
            <strong>Slut</strong> on{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>{' '}
            for unlimited plays, or check <Link to="/settings">Settings</Link>.
          </p>
        )}

        {showUpgradeHint && (
          <p className="muted mini-game-card__meta mini-game-card__meta--hint">
            Upgrade for more daily plays.{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>
            {' · '}
            <Link to="/settings">Settings</Link>
          </p>
        )}
      </div>
    );
  };

  const isPlayDisabled = (gameType: DailyGameType) => {
    if (playBusy === gameType) return true;
    const status = attemptStatuses?.[gameType];
    return status != null && !status.canPlay;
  };

  const hasGames =
    flashGames.length > 0 || instinctGames.length > 0 || puzzleGames.length > 0;

  return (
    <div className="page">
      <header className="page-header">
        <h2>Mini Games</h2>
        <p className="muted">Quick challenges to sharpen focus and recall.</p>
      </header>

      {loading && <p className="muted">Loading games…</p>}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {playError && (
        <p className="login-error" role="alert">
          {playError}
        </p>
      )}

      {!loading && !error && !hasGames && (
        <section className="card">
          <p className="muted">
            No mini games available yet. An admin can create games under Admin → Mini games.
          </p>
        </section>
      )}

      {!loading && hasGames && (
        <div className="mini-games-grid">
          {flashGames.map((game) => (
            <article key={`flash-${game.id}`} className="mini-game-card">
              <div className="mini-game-card__body">
                <span className="mini-game-card__badge">Focus Training</span>
                <h3 className="mini-game-card__title">Focus Training</h3>
                {game.description && (
                  <p className="muted mini-game-card__desc">{game.description}</p>
                )}
                {renderAttemptMeta('flash_cards')}
                <button
                  type="button"
                  className="btn btn--primary btn--block mini-game-card__play"
                  disabled={isPlayDisabled('flash_cards')}
                  onClick={() => void handlePlay({ type: 'flash', id: game.id })}
                >
                  {playBusy === 'flash_cards' ? 'Starting…' : 'Play'}
                </button>
              </div>
            </article>
          ))}

          {instinctGames.map((game) => (
            <article key={`instinct-${game.id}`} className="mini-game-card">
              <div className="mini-game-card__body">
                <span className="mini-game-card__badge">Camera</span>
                <h3 className="mini-game-card__title">Follow your instinct</h3>
                {game.description && (
                  <p className="muted mini-game-card__desc">{game.description}</p>
                )}
                {renderAttemptMeta('follow_instinct')}
                <button
                  type="button"
                  className="btn btn--primary btn--block mini-game-card__play"
                  disabled={isPlayDisabled('follow_instinct')}
                  onClick={() => void handlePlay({ type: 'instinct', id: game.id })}
                >
                  {playBusy === 'follow_instinct' ? 'Starting…' : 'Play'}
                </button>
              </div>
            </article>
          ))}

          {puzzleGames.length > 0 && (
            <article className="mini-game-card">
              <div className="mini-game-card__body">
                <span className="mini-game-card__badge">Puzzle</span>
                <h3 className="mini-game-card__title">Puzzle</h3>
                {renderAttemptMeta('puzzle')}
                <button
                  type="button"
                  className="btn btn--primary btn--block mini-game-card__play"
                  disabled={isPlayDisabled('puzzle')}
                  onClick={() => void handlePlay({ type: 'puzzle' })}
                >
                  {playBusy === 'puzzle' ? 'Starting…' : 'Play'}
                </button>
              </div>
            </article>
          )}
        </div>
      )}

      {!loading && hasGames && (
        <section className="mini-games-leaderboards">
          <h3 className="mini-games-leaderboards__heading">Leaderboards</h3>
          <p className="muted mini-games-leaderboards__intro">
            Top players by best streak in a single session.
          </p>
          <div className="mini-games-leaderboards__list">
            {flashGames.map((game) => (
              <MiniGameLeaderboard
                key={`leaderboard-flash-${game.id}`}
                gameType="flash_cards"
                gameId={game.id}
                title={game.title || 'Focus Training'}
                userId={session?.userId ?? null}
                refreshKey={leaderboardRefresh}
              />
            ))}
            {instinctGames.map((game) => (
              <MiniGameLeaderboard
                key={`leaderboard-instinct-${game.id}`}
                gameType="follow_instinct"
                gameId={game.id}
                title={game.title || 'Follow your instinct'}
                userId={session?.userId ?? null}
                refreshKey={leaderboardRefresh}
              />
            ))}
          </div>
        </section>
      )}

      {activeGame?.type === 'flash' && (
        <FlashWordGameModal gameId={activeGame.id} onClose={closeActiveGame} />
      )}
      {activeGame?.type === 'instinct' && (
        <FollowInstinctGameModal gameId={activeGame.id} onClose={closeActiveGame} />
      )}
      {activeGame?.type === 'puzzle' && (
        <PuzzleGameModal onClose={closeActiveGame} />
      )}
    </div>
  );
}
