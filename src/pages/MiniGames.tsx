import { useEffect, useState } from 'react';
import { FlashWordGameModal } from '../components/FlashWordGameModal';
import {
  fetchFlashWordGameSummaries,
  type FlashWordGameSummary,
} from '../lib/flashWordGames';

export function MiniGames() {
  const [games, setGames] = useState<FlashWordGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      const result = await fetchFlashWordGameSummaries();
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGames(result.games);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      {!loading && !error && games.length === 0 && (
        <section className="card">
          <p className="muted">
            No mini games available yet. An admin can create Flash Cards games under
            Admin → Mini games.
          </p>
        </section>
      )}

      {!loading && games.length > 0 && (
        <div className="mini-games-grid">
          {games.map((game) => (
            <article key={game.id} className="mini-game-card">
              <div className="mini-game-card__body">
                <span className="mini-game-card__badge">Focus Training</span>
                <h3 className="mini-game-card__title">Focus Training</h3>
                {game.description && (
                  <p className="muted mini-game-card__desc">{game.description}</p>
                )}
                <button
                  type="button"
                  className="btn btn--primary btn--block mini-game-card__play"
                  onClick={() => setActiveGameId(game.id)}
                >
                  Play
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {activeGameId && (
        <FlashWordGameModal
          gameId={activeGameId}
          onClose={() => setActiveGameId(null)}
        />
      )}
    </div>
  );
}
