import { useEffect, useState } from 'react';
import { FlashWordGameModal } from '../components/FlashWordGameModal';
import { FollowInstinctGameModal } from '../components/FollowInstinctGameModal';
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
  const [flashGames, setFlashGames] = useState<FlashWordGameSummary[]>([]);
  const [instinctGames, setInstinctGames] = useState<FollowInstinctGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGame, setActiveGame] = useState<ActiveGame>(null);

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

      {activeGame?.type === 'flash' && (
        <FlashWordGameModal
          gameId={activeGame.id}
          onClose={() => setActiveGame(null)}
        />
      )}
      {activeGame?.type === 'instinct' && (
        <FollowInstinctGameModal
          gameId={activeGame.id}
          onClose={() => setActiveGame(null)}
        />
      )}
    </div>
  );
}
