import { useAppStore } from '../hooks/useAppStore';

export function Punishments() {
  const { state, dismissPunishment } = useAppStore();
  const active = state.punishments.filter((p) => p.active);
  const history = state.punishments.filter((p) => !p.active).slice(-10).reverse();

  return (
    <div className="page">
      <header className="page-header">
        <h2>Punishments</h2>
        <p className="muted">Up to 2 punishments per day if you miss the quota</p>
      </header>

      {active.length === 0 ? (
        <section className="card card--success">
          <p>No active punishments. Keep it up! ✨</p>
        </section>
      ) : (
        <ul className="punishment-list">
          {active.map((p) => (
            <li key={p.id} className="card card--warn punishment-item">
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              {p.pointsLost > 0 && (
                <p className="punishment-points">−{p.pointsLost} points</p>
              )}
              <p className="muted">Assigned on {p.date}</p>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => dismissPunishment(p.id)}
              >
                Mark as completed
              </button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <section className="card">
          <h3 className="section-title">Recent history</h3>
          <ul className="history-list">
            {history.map((p) => (
              <li key={p.id}>
                <span>{p.title}</span>
                <span className="muted">{p.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
