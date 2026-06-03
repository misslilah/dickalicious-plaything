import { useState } from 'react';
import { BadgeGrid } from '../components/BadgeGrid';
import { StatCard } from '../components/StatCard';
import { useAppStore } from '../hooks/useAppStore';
import type { Reward } from '../types';

type RewardsTab = 'badges' | 'shop';

function isShopReward(reward: Reward): boolean {
  return !reward.autoTrigger && (reward.cost ?? 0) > 0;
}

export function Rewards() {
  const { state, purchaseReward } = useAppStore();
  const { progress, unlockedRewardIds, unlockedBadgeIds } = state;
  const [tab, setTab] = useState<RewardsTab>('badges');

  const shop = state.rewards.filter(isShopReward);

  return (
    <div className="page">
      <header className="page-header">
        <h2>Rewards</h2>
        <p className="muted">Earn points by completing tasks; spend them in the shop.</p>
      </header>

      <StatCard
        label="Your balance"
        value={progress.points}
        hint="Points from completed tasks"
        accent="var(--accent)"
      />

      <div className="tabs tabs--scroll" role="tablist" aria-label="Rewards sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'badges'}
          className={tab === 'badges' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('badges')}
        >
          Badges
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shop'}
          className={tab === 'shop' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('shop')}
        >
          Shop
        </button>
      </div>

      {tab === 'badges' && (
        <section className="card">
          <h3 className="section-title">Badges</h3>
          <p className="muted">Collect badges by meeting milestones.</p>
          <BadgeGrid
            badges={state.badges}
            unlockedBadgeIds={unlockedBadgeIds}
            tasks={state.tasks}
            categories={state.categories}
          />
        </section>
      )}

      {tab === 'shop' && (
        <section className="card">
          <h3 className="section-title">Shop</h3>
          {shop.length === 0 ? (
            <p className="muted">No shop rewards yet. Admins can add items with a point cost.</p>
          ) : (
            <ul className="reward-list">
              {shop.map((reward) => {
                const owned = unlockedRewardIds.includes(reward.id);
                const cost = reward.cost ?? 0;
                const canBuy = !owned && progress.points >= cost;
                return (
                  <li key={reward.id} className="reward-item">
                    <span className="reward-icon">🎁</span>
                    <div className="reward-item__body">
                      <strong>{reward.title}</strong>
                      <p className="muted">{reward.description}</p>
                      <span className="cost">{cost} pts</span>
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
          )}
        </section>
      )}
    </div>
  );
}
