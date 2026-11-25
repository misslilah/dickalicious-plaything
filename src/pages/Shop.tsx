import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShopEmpty,
  ShopSkeletonGrid,
  ShopTile,
  type TileStatus,
} from '../components/ShopTile';
import { TierBadge } from '../components/TierBadge';
import { UserAvatar } from '../components/UserAvatar';
import { useAppStore } from '../hooks/useAppStore';
import {
  AVATAR_FRAMES,
  getAvatarFrame,
  ownsAvatarFrame,
  type AvatarFrame,
} from '../lib/avatarFrames';
import { rarityFromCost, type CosmeticRarity } from '../lib/cosmeticRarity';
import {
  PROFILE_BANNERS,
  getProfileBanner,
  ownsBanner,
  type ProfileBanner,
} from '../lib/profileBanners';
import {
  purchaseProfileAvatarFrame,
  purchaseProfileBanner,
  updateProfileAvatarFrame,
  updateProfileBanner,
} from '../lib/profileDb';
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

type ShopTab = 'featured' | 'banners' | 'cosmetics' | 'videos' | 'rewards';
type ShopRarity = CosmeticRarity;

const FEATURED_BANNER_ID = 'neon';
const SECONDARY_FEATURED_BANNER_ID = 'void';

function isShopReward(reward: Reward): boolean {
  return !reward.autoTrigger && (reward.cost ?? 0) > 0;
}

function parseShopTab(raw: string | null): ShopTab {
  if (raw === 'featured' || raw === 'banners' || raw === 'videos' || raw === 'rewards') {
    return raw;
  }
  if (raw === 'cosmetics') return 'cosmetics';
  return 'featured';
}

function rarityFromTier(tier: string): ShopRarity {
  if (tier === 'slut') return 'legendary';
  if (tier === 'princess') return 'epic';
  if (tier === 'sweetie') return 'rare';
  return 'common';
}

function formatPoints(n: number): string {
  return n.toLocaleString();
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

function ShopShelf({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <section className="item-shop-shelf">
      <header className="item-shop-shelf__header">
        {kicker ? <p className="item-shop-shelf__kicker">{kicker}</p> : null}
        <h3 className="item-shop-shelf__title">{title}</h3>
      </header>
      {children}
    </section>
  );
}

export function Shop() {
  const {
    state,
    purchaseReward,
    purchaseVideo,
    purchaseTierShopVideo,
    isEffectiveAdmin,
    effectiveSession,
    session,
    refresh,
    refreshProfile,
    dataLoading,
  } = useAppStore();
  const { progress, unlockedRewardIds } = state;
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<ShopTab>(() => parseShopTab(searchParams.get('tab')));
  const [toast, setToast] = useState<string | null>(null);
  const [buyingVideoId, setBuyingVideoId] = useState<string | null>(null);
  const [buyingTierVideoId, setBuyingTierVideoId] = useState<string | null>(null);
  const [buyingBannerId, setBuyingBannerId] = useState<string | null>(null);
  const [buyingFrameId, setBuyingFrameId] = useState<string | null>(null);

  const isAdmin = isEffectiveAdmin;
  const ownedBannerIds = session?.ownedBannerIds ?? [];
  const equippedBannerId = session?.bannerId ?? getProfileBanner(null).id;
  const ownedFrameIds = session?.ownedAvatarFrameIds ?? [];
  const equippedFrameId =
    session?.avatarFrameId ?? getAvatarFrame(null).id;

  useEffect(() => {
    setTab(parseShopTab(searchParams.get('tab')));
  }, [searchParams]);

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
  const showRewardsTab = shop.length > 0;

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

  const featuredBanner =
    PROFILE_BANNERS.find((banner) => banner.id === FEATURED_BANNER_ID) ??
    PROFILE_BANNERS[0]!;
  const topReward = useMemo(
    () => [...shop].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))[0],
    [shop],
  );
  const secondaryBanner =
    PROFILE_BANNERS.find((banner) => banner.id === SECONDARY_FEATURED_BANNER_ID) ??
    PROFILE_BANNERS.find((banner) => banner.id !== featuredBanner.id);
  const featuredBannerIds = new Set(
    [featuredBanner.id, topReward ? null : secondaryBanner?.id].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const dailyBanners = PROFILE_BANNERS.filter((banner) => !featuredBannerIds.has(banner.id));

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

  const handleBannerAction = async (bannerId: string) => {
    if (!session?.userId) return;
    const banner = getProfileBanner(bannerId);
    setBuyingBannerId(bannerId);

    if (!ownsBanner(ownedBannerIds, bannerId) && banner.pricePoints > 0) {
      const result = await purchaseProfileBanner(
        session.userId,
        bannerId,
        ownedBannerIds,
        progress.points,
      );
      setBuyingBannerId(null);
      if (!result.ok) {
        setToast(result.error);
        return;
      }
      setToast(`Unlocked “${banner.name}” and equipped it.`);
      await refresh();
      await refreshProfile();
      return;
    }

    const result = await updateProfileBanner(
      session.userId,
      bannerId,
      ownedBannerIds,
    );
    setBuyingBannerId(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setToast(`Equipped “${banner.name}”.`);
    await refreshProfile();
  };

  const handleFrameAction = async (frameId: string) => {
    if (!session?.userId) return;
    const frame = getAvatarFrame(frameId);
    setBuyingFrameId(frameId);

    if (!ownsAvatarFrame(ownedFrameIds, frameId) && frame.pricePoints > 0) {
      const result = await purchaseProfileAvatarFrame(
        session.userId,
        frameId,
        ownedFrameIds,
        progress.points,
      );
      setBuyingFrameId(null);
      if (!result.ok) {
        setToast(result.error);
        return;
      }
      setToast(`Unlocked “${frame.name}” and equipped it.`);
      await refresh();
      await refreshProfile();
      return;
    }

    const result = await updateProfileAvatarFrame(
      session.userId,
      frameId,
      ownedFrameIds,
    );
    setBuyingFrameId(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setToast(
      frame.id === 'none'
        ? 'Unequipped contour.'
        : `Equipped “${frame.name}”.`,
    );
    await refreshProfile();
  };

  const handleBuyReward = (reward: Reward) => {
    purchaseReward(reward.id);
    setToast(`Unlocked “${reward.title}”.`);
  };

  const bannerTile = (banner: ProfileBanner, size: 'standard' | 'featured', ribbon?: string) => {
    const owned = ownsBanner(ownedBannerIds, banner.id);
    const equipped = equippedBannerId === banner.id;
    const canBuy = !owned && progress.points >= banner.pricePoints;
    const status: TileStatus = equipped
      ? 'equipped'
      : buyingBannerId === banner.id
        ? 'buying'
        : owned
          ? 'equip'
          : 'buy';
    return (
      <ShopTile
        key={banner.id}
        rarity={rarityFromCost(banner.pricePoints)}
        size={size}
        name={banner.name}
        subtitle={banner.description}
        priceLabel={banner.pricePoints > 0 ? formatPoints(banner.pricePoints) : 'Free'}
        artStyle={{ background: banner.gradient }}
        ribbon={ribbon}
        status={status}
        disabled={!owned && !canBuy}
        onAction={() => void handleBannerAction(banner.id)}
      />
    );
  };

  const frameTile = (frame: AvatarFrame) => {
    const owned = ownsAvatarFrame(ownedFrameIds, frame.id);
    const equipped = equippedFrameId === frame.id;
    const canBuy = !owned && progress.points >= frame.pricePoints;
    const status: TileStatus = equipped
      ? 'equipped'
      : buyingFrameId === frame.id
        ? 'buying'
        : owned
          ? 'equip'
          : 'buy';
    return (
      <ShopTile
        key={frame.id}
        rarity={frame.rarity}
        name={frame.name}
        subtitle={frame.description}
        priceLabel={frame.pricePoints > 0 ? formatPoints(frame.pricePoints) : 'Free'}
        artStyle={{ background: frame.previewGradient }}
        preview={
          <UserAvatar
            url={session?.avatarUrl ?? null}
            name={session?.username ?? 'You'}
            frameId={frame.id}
            size="lg"
          />
        }
        status={status}
        disabled={!owned && !canBuy}
        onAction={() => void handleFrameAction(frame.id)}
      />
    );
  };

  const rewardTile = (reward: Reward, size: 'standard' | 'featured' = 'standard', ribbon?: string) => {
    const owned = unlockedRewardIds.includes(reward.id);
    const cost = reward.cost ?? 0;
    const canBuy = !owned && progress.points >= cost;
    return (
      <ShopTile
        key={reward.id}
        rarity={rarityFromCost(cost)}
        size={size}
        name={reward.title}
        subtitle={reward.description}
        priceLabel={formatPoints(cost)}
        icon="🎁"
        artStyle={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(245, 200, 76, 0.45), transparent 55%), linear-gradient(160deg, #3b1248, #1c1028)',
        }}
        ribbon={ribbon}
        status={owned ? 'owned' : 'buy'}
        disabled={!canBuy}
        onAction={() => handleBuyReward(reward)}
      />
    );
  };

  const videoTile = (
    video: Video,
    cost: number,
    buying: boolean,
    onBuy: () => void,
  ) => {
    const category = state.videoCategories.find((c) => c.id === video.categoryId);
    const canBuy = progress.points >= cost;
    const required = videoRequiredTier(video, category);
    return (
      <ShopTile
        key={video.id}
        rarity={rarityFromTier(required)}
        name={video.title}
        subtitle={
          <>
            {categoryName(video)}
            {' · '}
            <TierBadge tier={required} accessStyle />
          </>
        }
        priceLabel={formatPoints(cost)}
        icon="🎬"
        artStyle={{
          background:
            'radial-gradient(circle at 50% 28%, rgba(232, 121, 249, 0.35), transparent 52%), linear-gradient(165deg, #1e1b4b, #0a0510)',
        }}
        status={buying ? 'buying' : 'buy'}
        disabled={!canBuy || buying}
        onAction={onBuy}
      />
    );
  };

  const tabs: { id: ShopTab; label: string }[] = [
    { id: 'featured', label: 'Featured' },
    { id: 'banners', label: 'Banners' },
    { id: 'cosmetics', label: 'Cosmetics' },
    { id: 'videos', label: 'Videos' },
    ...(showRewardsTab ? [{ id: 'rewards' as const, label: 'Rewards' }] : []),
  ];

  return (
    <div className="page item-shop">
      <header className="item-shop__header" data-tutorial="home-shop">
        <div className="item-shop__titles">
          <p className="item-shop__kicker">Daily drop</p>
          <h2 className="item-shop__title">Item Shop</h2>
          <p className="muted item-shop__tagline">
            Featured rotation · Spend points on banners, videos, and cosmetics.
          </p>
        </div>
        <div className="item-shop-bucks" aria-label={`${formatPoints(progress.points)} points`}>
          <span className="item-shop-bucks__gem" aria-hidden>
            ◆
          </span>
          <span className="item-shop-bucks__value">{formatPoints(progress.points)}</span>
          <span className="item-shop-bucks__label">Points</span>
        </div>
      </header>

      <div className="tabs tabs--scroll item-shop__tabs" role="tablist" aria-label="Shop sections">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'tab tab--active' : 'tab'}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'featured' && (
        <>
          <ShopShelf title="Featured" kicker="Locked in today">
            <div className="item-shop-featured">
              {bannerTile(featuredBanner, 'featured', 'Featured')}
              {topReward
                ? rewardTile(topReward, 'featured', 'Premium')
                : secondaryBanner
                  ? bannerTile(secondaryBanner, 'featured', 'Featured')
                  : null}
            </div>
          </ShopShelf>

          {dailyBanners.length > 0 && (
            <ShopShelf title="Daily" kicker="Always in rotation">
              <div className="item-shop-grid">
                {dailyBanners.map((banner) => bannerTile(banner, 'standard'))}
              </div>
            </ShopShelf>
          )}
        </>
      )}

      {tab === 'banners' && (
        <ShopShelf title="Profile banners" kicker="Glow up your profile">
          <p className="muted item-shop-shelf__copy">
            Dusk and Rose are free. Paid banners spend task points and stay on
            your profile.
          </p>
          <div className="item-shop-grid">
            {PROFILE_BANNERS.map((banner) =>
              bannerTile(
                banner,
                'standard',
                banner.id === FEATURED_BANNER_ID ? 'Featured' : undefined,
              ),
            )}
          </div>
        </ShopShelf>
      )}

      {tab === 'cosmetics' && (
        <>
          <ShopShelf title="Avatar contours" kicker="One equipped at a time">
            <p className="muted item-shop-shelf__copy">
              Frames sit around your profile photo — crown, liquid silver,
              flames, and more. Equip None to go bare. The equipped contour
              follows your avatar on Home and Profile.
            </p>
            <div className="item-shop-grid">
              {AVATAR_FRAMES.map((frame) => frameTile(frame))}
            </div>
          </ShopShelf>
        </>
      )}

      {tab === 'videos' && (
        <>
          {tierShopOptions.map((option) => (
            <ShopShelf
              key={option.tier}
              title={option.label}
              kicker={`${formatPoints(option.cost)} points each`}
            >
              <p className="muted item-shop-shelf__copy">{option.description}</p>
              {option.eligibleVideos.length === 0 ? (
                dataLoading && state.videos.length === 0 ? (
                  <ShopSkeletonGrid count={3} />
                ) : (
                  <ShopEmpty icon="🎬" title="Nothing left in this tier">
                    You already have access to every video here. Check back
                    when new ones drop.
                  </ShopEmpty>
                )
              ) : (
                <div className="item-shop-grid">
                  {option.eligibleVideos.map((video) =>
                    videoTile(video, option.cost, buyingTierVideoId === video.id, () =>
                      void handleBuyTierShopVideo(video, option.cost),
                    ),
                  )}
                </div>
              )}
            </ShopShelf>
          ))}

          {shopVideos.length > 0 && (
            <ShopShelf title="Individual videos" kicker="Priced by admin">
              <p className="muted item-shop-shelf__copy">
                Pick a specific video when the admin has set an individual shop
                price.
              </p>
              <div className="item-shop-grid">
                {shopVideos.map((video) =>
                  videoTile(
                    video,
                    video.shopPointsCost ?? 0,
                    buyingVideoId === video.id,
                    () => void handleBuyVideo(video),
                  ),
                )}
              </div>
            </ShopShelf>
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

      {tab === 'rewards' && (
        <ShopShelf title="Rewards" kicker="Spend your grind">
          {shop.length === 0 ? (
            <ShopEmpty icon="🎁" title="No rewards yet">
              Admins can add items with a point cost. They will show up here.
            </ShopEmpty>
          ) : (
            <div className="item-shop-grid">
              {shop.map((reward) => rewardTile(reward))}
            </div>
          )}
        </ShopShelf>
      )}

      {toast && (
        <ShopPurchaseToast message={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
