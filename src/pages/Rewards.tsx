import { useAppStore } from '../hooks/useAppStore';

export function Rewards() {
  const { state, purchaseReward } = useAppStore();
  const { progress, unlockedRewardIds } = state;

  const badges = state.rewards.filter((r) => r.autoTrigger);
  const shop = state.rewards.filter((r) => r.cost != null);

  return (
    <div className="page">
      <header className="page-header">
        <h2>Rewards</h2>
        <p className="muted">{progress.points} points available</p>
      </header>

      <section className="card">
        <h3 className="section-title">Badges</h3>
        <ul className="reward-list">
          {badges.map((reward) => {
            const earned = unlockedRewardIds.includes(reward.id);
            return (
              <li
                key={reward.id}
                className={`reward-item${earned ? ' reward-item--earned' : ''}`}
              >
                <span className="reward-icon">{earned ? '🏅' : '🔒'}</span>
                <div>
                  <strong>{reward.title}</strong>
                  <p className="muted">{reward.description}</p>
                  {reward.autoTrigger?.type === 'streak' && (
                    <small>Streak: {reward.autoTrigger.days} days</small>
                  )}
                  {reward.autoTrigger?.type === 'level' && (
                    <small>Level {reward.autoTrigger.level}</small>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Shop</h3>
        <ul className="reward-list">
          {shop.map((reward) => {
            const owned = unlockedRewardIds.includes(reward.id);
            const canBuy = !owned && progress.points >= (reward.cost ?? 0);
            return (
              <li key={reward.id} className="reward-item">
                <span className="reward-icon">🎁</span>
                <div className="reward-item__body">
                  <strong>{reward.title}</strong>
                  <p className="muted">{reward.description}</p>
                  <span className="cost">{reward.cost} pts</span>
                </div>
                {owned ? (
                  <span className="tag tag--ok">Purchased</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={!canBuy}
                    onClick={() => purchaseReward(reward.id)}
                  >
                    Buy
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
