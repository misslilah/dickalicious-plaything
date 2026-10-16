import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TierBadge } from '../components/TierBadge';
import { useAppStore } from '../hooks/useAppStore';
import { CLOTHING_CATALOG, CLOTHING_SLOTS } from '../lib/characterSprite';
import {
  PROFILE_BANNERS,
  getProfileBanner,
  ownsBanner,
  type ProfileBanner,
} from '../lib/profileBanners';
import {
  purchaseProfileBanner,
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
type ShopRarity = 'common' | 'rare' | 'epic' | 'legendary';
type TileStatus = 'buy' | 'equip' | 'owned' | 'equipped' | 'locked' | 'buying';

const FEATURED_BANNER_ID = 'neon';
const SECONDARY_FEATURED_BANNER_ID = 'void';

const CLOTHING_TEASERS = [
  {
    id: 'teaser-top',
    name: 'Velvet Top',
    slot: 'top',
    rarity: 'epic' as const,
    art: 'linear-gradient(160deg, #3b0764 0%, #7e22ce 48%, #f0abfc 100%)',
  },
  {
    id: 'teaser-bottom',
    name: 'Nightshade Bottoms',
    slot: 'bottom',
    rarity: 'rare' as const,
    art: 'linear-gradient(160deg, #082f49 0%, #0369a1 50%, #67e8f9 100%)',
  },
  {
    id: 'teaser-underwear',
    name: 'Silk Underwear',
    slot: 'underwear',
    rarity: 'legendary' as const,
    art: 'linear-gradient(160deg, #422006 0%, #a16207 46%, #f5c84c 100%)',
  },
] as const;

function isShopReward(reward: Reward): boolean {
  return !reward.autoTrigger && (reward.cost ?? 0) > 0;
}

function parseShopTab(raw: string | null): ShopTab {
  if (raw === 'featured' || raw === 'banners' || raw === 'videos' || raw === 'rewards') {
    return raw;
  }
  if (raw === 'clothes' || raw === 'cosmetics') return 'cosmetics';
  return 'featured';
}

function rarityFromCost(cost: number): ShopRarity {
  if (cost <= 0) return 'common';
  if (cost < 200) return 'rare';
  if (cost < 400) return 'epic';
  return 'legendary';
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

function ShopTile({
  rarity,
  size = 'standard',
  name,
  subtitle,
  priceLabel,
  artStyle,
  icon,
  ribbon,
  status,
  disabled,
  onAction,
}: {
  rarity: ShopRarity;
  size?: 'standard' | 'featured';
  name: string;
  subtitle?: ReactNode;
  priceLabel: string;
  artStyle?: CSSProperties;
  icon?: string;
  ribbon?: string;
  status: TileStatus;
  disabled?: boolean;
  onAction?: () => void;
}) {
  const cta =
    status === 'buying'
      ? 'Buying…'
      : status === 'equip'
        ? 'Equip'
        : status === 'owned'
          ? 'Owned'
          : status === 'equipped'
            ? 'Equipped'
            : status === 'locked'
              ? 'Locked'
              : 'BUY';
  const actionable = status === 'buy' || status === 'equip' || status === 'buying';

  return (
    <article
      className={`item-shop-tile item-shop-tile--${rarity}${
        size === 'featured' ? ' item-shop-tile--featured' : ''
      }${status === 'locked' ? ' item-shop-tile--locked' : ''}`}
    >
      <div className="item-shop-tile__art" style={artStyle}>
        {ribbon ? <span className="item-shop-tile__ribbon">{ribbon}</span> : null}
        <span className="item-shop-tile__rarity">{rarity}</span>
        {icon ? (
          <span className="item-shop-tile__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        {status === 'locked' ? (
          <span className="item-shop-tile__lock" aria-hidden>
            🔒
          </span>
        ) : null}
      </div>
      <div className="item-shop-tile__body">
        <strong className="item-shop-tile__name">{name}</strong>
        {subtitle ? <p className="item-shop-tile__sub">{subtitle}</p> : null}
      </div>
      <div className="item-shop-tile__bar">
        <span className="item-shop-tile__price">
          <span className="item-shop-tile__gem" aria-hidden>
            ◆
          </span>
          {priceLabel}
        </span>
        {actionable ? (
          <button
            type="button"
            className="btn btn--primary btn--small item-shop-tile__buy"
            disabled={disabled || status === 'buying'}
            onClick={onAction}
          >
            {cta}
          </button>
        ) : (
          <span
            className={`item-shop-tile__status${
              status === 'equipped' || status === 'owned'
                ? ' item-shop-tile__status--ok'
                : ''
            }`}
          >
            {cta}
          </span>
        )}
      </div>
    </article>
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
  } = useAppStore();
  const { progress, unlockedRewardIds } = state;
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<ShopTab>(() => parseShopTab(searchParams.get('tab')));
  const [toast, setToast] = useState<string | null>(null);
  const [buyingVideoId, setBuyingVideoId] = useState<string | null>(null);
  const [buyingTierVideoId, setBuyingTierVideoId] = useState<string | null>(null);
  const [buyingBannerId, setBuyingBannerId] = useState<string | null>(null);

  const isAdmin = isEffectiveAdmin;
  const ownedBannerIds = session?.ownedBannerIds ?? [];
  const equippedBannerId = session?.bannerId ?? getProfileBanner(null).id;

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
      <header className="item-shop__header">
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
                <ShopTile
                  rarity="legendary"
                  name="Coming soon"
                  subtitle="Character clothes drop next"
                  priceLabel="Soon"
                  icon="👗"
                  artStyle={{
                    background:
                      'linear-gradient(160deg, #422006 0%, #9d174d 48%, #f5c84c 100%)',
                  }}
                  ribbon="Teaser"
                  status="locked"
                />
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
        <ShopShelf title="Cosmetics" kicker="Paper-doll drip">
          <p className="muted item-shop-shelf__copy">
            Character clothing will use the paper-doll slots{' '}
            {CLOTHING_SLOTS.join(', ')}. Outfits stay on your sprite once the
            catalog drops.
          </p>
          {CLOTHING_CATALOG.length === 0 ? (
            <div className="item-shop-grid">
              {CLOTHING_TEASERS.map((item) => (
                <ShopTile
                  key={item.id}
                  rarity={item.rarity}
                  name={item.name}
                  subtitle={`${item.slot} · Coming soon`}
                  priceLabel="Soon"
                  icon="👗"
                  artStyle={{ background: item.art }}
                  ribbon="Locked"
                  status="locked"
                />
              ))}
            </div>
          ) : (
            <div className="item-shop-grid">
              {CLOTHING_CATALOG.map((item) => (
                <ShopTile
                  key={item.id}
                  rarity={item.paid ? 'epic' : 'common'}
                  name={item.name}
                  subtitle={item.slot}
                  priceLabel={item.paid ? 'Paid' : 'Free'}
                  icon="👗"
                  status="locked"
                />
              ))}
            </div>
          )}
        </ShopShelf>
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
                <p className="muted">No videos left in this tier.</p>
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
            <p className="muted">
              No shop rewards yet. Admins can add items with a point cost.
            </p>
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
