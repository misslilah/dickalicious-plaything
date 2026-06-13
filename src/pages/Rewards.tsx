import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeGrid } from '../components/BadgeGrid';
import { StatCard } from '../components/StatCard';
import { TierBadge } from '../components/TierBadge';
import { useAppStore } from '../hooks/useAppStore';
import { useSortableList } from '../hooks/useSortableList';
import {
  hasVideoAccess,
  isVideoShopPurchasable,
  videoRequiredTier,
  type VideoAccessContext,
} from '../lib/videoAccess';
import {
  getTierShopEligibleVideos,
  TIER_VIDEO_SHOP_OPTIONS,
} from '../lib/videoTierShop';
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
  const {
    state,
    purchaseReward,
    purchaseVideo,
    purchaseTierShopVideo,
    reorderBadges,
    isEffectiveAdmin,
    effectiveSession,
  } = useAppStore();
  const { progress, unlockedRewardIds, unlockedBadgeIds } = state;
  const [tab, setTab] = useState<RewardsTab>('badges');
  const [toast, setToast] = useState<string | null>(null);
  const [buyingVideoId, setBuyingVideoId] = useState<string | null>(null);
  const [buyingTierVideoId, setBuyingTierVideoId] = useState<string | null>(null);
  const [badgeReorderBusy, setBadgeReorderBusy] = useState(false);
  const [badgeReorderError, setBadgeReorderError] = useState('');

  const isAdmin = isEffectiveAdmin;

  const sortedBadgeIds = useMemo(
    () =>
      [...state.badges]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
        )
        .map((b) => b.id),
    [state.badges],
  );

  const persistBadgeOrder = async (orderedIds: string[]) => {
    setBadgeReorderBusy(true);
    setBadgeReorderError('');
    const result = await reorderBadges(orderedIds);
    setBadgeReorderBusy(false);
    if (!result.ok) setBadgeReorderError(result.error);
  };

  const { getSortableItemProps, sortableEnabled } = useSortableList(
    sortedBadgeIds,
    persistBadgeOrder,
    { disabled: !isAdmin, busy: badgeReorderBusy },
  );

  const videoAccessCtx: VideoAccessContext = useMemo(
    () => ({
      patreonTier: effectiveSession?.patreonTier,
      patreonStatus: effectiveSession?.patreonStatus,
      isAdmin,
      purchasedVideoIds: state.purchasedVideoIds,
    }),
    [
      effectiveSession?.patreonTier,
      effectiveSession?.patreonStatus,
      isAdmin,
      state.purchasedVideoIds,
    ],
  );

  const shop = state.rewards.filter(isShopReward);

  const tierShopOptions = useMemo(
    () =>
      TIER_VIDEO_SHOP_OPTIONS.map((option) => ({
        ...option,
        eligibleVideos: getTierShopEligibleVideos(
          option.tier,
          state.videos,
          state.videoCategories,
          videoAccessCtx,
        ),
      })),
    [state.videos, state.videoCategories, videoAccessCtx],
  );

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

  const handleBuyTierShopVideo = async (video: Video, cost: number) => {
    if (cost <= 0) return;
    setBuyingTierVideoId(video.id);
    const result = await purchaseTierShopVideo(video.id);
    setBuyingTierVideoId(null);
    if (result.ok) {
      setToast(`Unlocked “${result.videoTitle}”. Watch it in Videos.`);
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
          {isAdmin && sortableEnabled && (
            <p className="profile-badge-grid__reorder-hint muted">
              Drag to reorder badges
            </p>
          )}
          {badgeReorderError && (
            <p className="profile-badge-grid__reorder-error" role="alert">
              {badgeReorderError}
            </p>
          )}
          <BadgeGrid
            badges={state.badges}
            unlockedBadgeIds={unlockedBadgeIds}
            tasks={state.tasks}
            categories={state.categories}
            sortable={isAdmin}
            getSortableItemProps={isAdmin ? getSortableItemProps : undefined}
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
              Pick a tier-locked video to unlock with your task points. Each purchase
              unlocks one video.
            </p>
            {tierShopOptions.map((option) => (
              <div key={option.tier} className="tier-shop-section">
                <header className="tier-shop-section__header">
                  <h4 className="tier-shop-section__title">
                    {option.label}
                    {' · '}
                    <TierBadge tier={option.tier} accessStyle />
                  </h4>
                  <p className="muted">{option.description}</p>
                  <p className="muted tier-shop-section__price">
                    {option.cost} points per video
                  </p>
                </header>
                {option.eligibleVideos.length === 0 ? (
                  <p className="muted tier-shop-section__empty">
                    No videos left in this tier.
                  </p>
                ) : (
                  <ul className="tier-shop-grid">
                    {option.eligibleVideos.map((video) => {
                      const category = state.videoCategories.find(
                        (c) => c.id === video.categoryId,
                      );
                      const canBuy = progress.points >= option.cost;
                      const required = videoRequiredTier(video, category);
                      return (
                        <li key={video.id} className="tier-shop-card">
                          <span className="tier-shop-card__icon" aria-hidden>
                            🎬
                          </span>
                          <div className="tier-shop-card__body">
                            <strong className="tier-shop-card__title">
                              {video.title}
                            </strong>
                            <p className="muted tier-shop-card__meta">
                              {categoryName(video)}
                              {' · '}
                              <TierBadge tier={required} accessStyle />
                            </p>
                            <span className="cost">{option.cost} pts</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn--small"
                            disabled={!canBuy || buyingTierVideoId === video.id}
                            onClick={() =>
                              void handleBuyTierShopVideo(video, option.cost)
                            }
                          >
                            {buyingTierVideoId === video.id ? 'Buying…' : 'Buy'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </section>

          {shopVideos.length > 0 && (
            <section className="card">
              <h3 className="section-title">Individual videos</h3>
              <p className="muted">
                Pick a specific video when the admin has set an individual shop price.
              </p>
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
            </section>
          )}

          {state.purchasedVideoIds.length > 0 && (
            <p className="muted shop-owned-hint">
              You own {state.purchasedVideoIds.length} individually unlocked{' '}
              {state.purchasedVideoIds.length === 1 ? 'video' : 'videos'}.{' '}
              <Link to="/videos">Open Videos</Link>
            </p>
          )}
        </>
      )}

      {toast && (
        <ShopPurchaseToast message={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
