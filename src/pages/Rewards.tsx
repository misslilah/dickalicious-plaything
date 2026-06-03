import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeGrid } from '../components/BadgeGrid';
import { StatCard } from '../components/StatCard';
import { TierBadge } from '../components/TierBadge';
import { useAppStore } from '../hooks/useAppStore';
import {
  hasVideoAccess,
  isVideoShopPurchasable,
  videoRequiredTier,
  type VideoAccessContext,
} from '../lib/videoAccess';
import type { Reward, Video } from '../types';

type RewardsTab = 'badges' | 'shop';

function isShopReward(reward: Reward): boolean {
  return !reward.autoTrigger && (reward.cost ?? 0) > 0;
}

function ShopPurchaseToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="shop-purchase-toast" role="status" aria-live="polite">
      <p className="shop-purchase-toast__text">{message}</p>
      <button
        type="button"
        className="shop-purchase-toast__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function Rewards() {
  const { state, session, purchaseReward, purchaseVideo } = useAppStore();
  const { progress, unlockedRewardIds, unlockedBadgeIds } = state;
  const [tab, setTab] = useState<RewardsTab>('badges');
  const [toast, setToast] = useState<string | null>(null);
  const [buyingVideoId, setBuyingVideoId] = useState<string | null>(null);

  const isAdmin = session?.role === 'admin';

  const videoAccessCtx: VideoAccessContext = useMemo(
    () => ({
      patreonTier: session?.patreonTier,
      patreonStatus: session?.patreonStatus,
      isAdmin,
      purchasedVideoIds: state.purchasedVideoIds,
    }),
    [
      session?.patreonTier,
      session?.patreonStatus,
      isAdmin,
      state.purchasedVideoIds,
    ],
  );

  const shop = state.rewards.filter(isShopReward);

  const shopVideos = useMemo(() => {
    return state.videos
      .filter((v) => isVideoShopPurchasable(v))
      .filter((v) => {
        const category = state.videoCategories.find((c) => c.id === v.categoryId);
        return !hasVideoAccess(v, category, videoAccessCtx);
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [state.videos, state.videoCategories, videoAccessCtx]);

  const categoryName = (video: Video) =>
    state.videoCategories.find((c) => c.id === video.categoryId)?.name ?? 'Videos';

  const handleBuyVideo = async (video: Video) => {
    const cost = video.shopPointsCost ?? 0;
    if (cost <= 0) return;
    setBuyingVideoId(video.id);
    const result = await purchaseVideo(video.id);
    setBuyingVideoId(null);
    if (result.ok) {
      setToast(`Unlocked “${video.title}”. Watch it in Videos.`);
    } else {
      setToast(result.error);
    }
  };

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
        <>
          <section className="card">
            <h3 className="section-title">Rewards</h3>
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

          <section className="card">
            <h3 className="section-title">Videos</h3>
            <p className="muted">
              Unlock individual tier-locked videos with your task points.
            </p>
            {shopVideos.length === 0 ? (
              <p className="muted">
                No videos for sale right now, or you already have access to every
                listed unlock.
              </p>
            ) : (
              <ul className="reward-list">
                {shopVideos.map((video) => {
                  const category = state.videoCategories.find(
                    (c) => c.id === video.categoryId,
                  );
                  const cost = video.shopPointsCost ?? 0;
                  const canBuy = progress.points >= cost;
                  const required = videoRequiredTier(video, category);
                  return (
                    <li key={video.id} className="reward-item">
                      <span className="reward-icon">🎬</span>
                      <div className="reward-item__body">
                        <strong>{video.title}</strong>
                        <p className="muted">
                          {categoryName(video)}
                          {' · '}
                          <TierBadge tier={required} accessStyle />
                        </p>
                        <span className="cost">{cost} pts</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--small"
                        disabled={!canBuy || buyingVideoId === video.id}
                        onClick={() => void handleBuyVideo(video)}
                      >
                        {buyingVideoId === video.id ? 'Buying…' : 'Buy'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {state.purchasedVideoIds.length > 0 && (
              <p className="muted shop-owned-hint">
                You own {state.purchasedVideoIds.length} individually unlocked{' '}
                {state.purchasedVideoIds.length === 1 ? 'video' : 'videos'}.{' '}
                <Link to="/videos">Open Videos</Link>
              </p>
            )}
          </section>
        </>
      )}

      {toast && (
        <ShopPurchaseToast message={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
