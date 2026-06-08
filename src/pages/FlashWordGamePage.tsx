import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlashWordGameModal } from '../components/FlashWordGameModal';
import { startMiniGameAttempt } from '../lib/dailyGameAttempts';

export function FlashWordGamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    void (async () => {
      setError('');
      setReady(false);
      const result = await startMiniGameAttempt('flash_cards');
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (!gameId) {
    return (
      <div className="page">
        <header className="page-header">
          <Link to="/mini-games" className="back-link">
            ← Mini Games
          </Link>
          <h2>Flash Cards</h2>
        </header>
        <p className="login-error" role="alert">
          Game not found.
        </p>
        <Link to="/mini-games" className="btn btn--ghost">
          Back to Mini Games
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <header className="page-header">
          <Link to="/mini-games" className="back-link">
            ← Mini Games
          </Link>
          <h2>Focus Training</h2>
        </header>
        <p className="login-error" role="alert">
          {error}
        </p>
        <Link to="/mini-games" className="btn btn--ghost">
          Back to Mini Games
        </Link>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="page">
        <header className="page-header">
          <Link to="/mini-games" className="back-link">
            ← Mini Games
          </Link>
          <h2>Focus Training</h2>
        </header>
        <p className="muted">Starting game…</p>
      </div>
    );
  }

  return (
    <FlashWordGameModal
      gameId={gameId}
      onClose={() => navigate('/mini-games')}
    />
  );
}
