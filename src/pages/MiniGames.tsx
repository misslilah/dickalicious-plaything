import { useEffect, useState } from 'react';
import { FlashWordGameModal } from '../components/FlashWordGameModal';
import { FollowInstinctGameModal } from '../components/FollowInstinctGameModal';
import { MiniGameLeaderboard } from '../components/MiniGameLeaderboard';
import { useAppStore } from '../hooks/useAppStore';
import {
  fetchFlashWordGameSummaries,
  type FlashWordGameSummary,
} from '../lib/flashWordGames';
import {
  fetchFollowInstinctGameSummaries,
  type FollowInstinctGameSummary,
} from '../lib/followInstinctGames';

type ActiveGame =
  | { type: 'flash'; id: string }
  | { type: 'instinct'; id: string }
  | null;

export function MiniGames() {
  const { session } = useAppStore();
  const [flashGames, setFlashGames] = useState<FlashWordGameSummary[]>([]);
  const [instinctGames, setInstinctGames] = useState<FollowInstinctGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGame, setActiveGame] = useState<ActiveGame>(null);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);

  const closeActiveGame = () => {
    setActiveGame(null);
    setLeaderboardRefresh((tick) => tick + 1);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      const [flashResult, instinctResult] = await Promise.all([
        fetchFlashWordGameSummaries(),
        fetchFollowInstinctGameSummaries(),
      ]);
      if (cancelled) return;
      setLoading(false);
      const errors: string[] = [];
      if (!flashResult.ok) errors.push(flashResult.error);
      else setFlashGames(flashResult.games);
      if (!instinctResult.ok) errors.push(instinctResult.error);
      else setInstinctGames(instinctResult.games);
      if (errors.length === 2) setError(errors.join(' '));
      else if (errors.length === 1) setError(errors[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasGames = flashGames.length > 0 || instinctGames.length > 0;

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
                <button
                  type="button"
                  className="btn btn--primary btn--block mini-game-card__play"
                  onClick={() => setActiveGame({ type: 'flash', id: game.id })}
                >
                  Play
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
                <button
                  type="button"
                  className="btn btn--primary btn--block mini-game-card__play"
                  onClick={() => setActiveGame({ type: 'instinct', id: game.id })}
                >
                  Play
                </button>
              </div>
            </article>
          ))}
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
    </div>
  );
}
