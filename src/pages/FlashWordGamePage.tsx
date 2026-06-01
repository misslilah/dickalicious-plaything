import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlashWordGameModal } from '../components/FlashWordGameModal';

export function FlashWordGamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

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

  return (
    <FlashWordGameModal
      gameId={gameId}
      onClose={() => navigate('/mini-games')}
    />
  );
}
