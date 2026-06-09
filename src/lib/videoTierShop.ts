import {
  hasVideoAccess,
  isVideoShopPurchasable,
  videoRequiredTier,
  type VideoAccessContext,
} from './videoAccess';
import type { ContentTier, Video, VideoCategory } from '../types';

export type TierShopTier = 'sweetie' | 'princess' | 'slut';

export interface TierVideoShopOption {
  tier: TierShopTier;
  cost: number;
  label: string;
  description: string;
}

export const TIER_VIDEO_SHOP_OPTIONS: TierVideoShopOption[] = [
  {
    tier: 'sweetie',
    cost: 250,
    label: 'Sweetie videos',
    description: 'Pick a Sweetie-tier video to unlock.',
  },
  {
    tier: 'princess',
    cost: 400,
    label: 'Princess videos',
    description: 'Pick a Princess-tier video to unlock.',
  },
  {
    tier: 'slut',
    cost: 700,
    label: 'Slut videos',
    description: 'Pick a Slut-tier video to unlock.',
  },
];

export function getTierShopCost(tier: TierShopTier): number {
  return TIER_VIDEO_SHOP_OPTIONS.find((o) => o.tier === tier)?.cost ?? 0;
}

export function getTierShopEligibleVideos(
  tier: TierShopTier,
  videos: readonly Video[],
  categories: readonly VideoCategory[],
  ctx: VideoAccessContext,
): Video[] {
  return videos
    .filter((video) => {
      if (isVideoShopPurchasable(video)) return false;
      const category = categories.find((c) => c.id === video.categoryId);
      const required = videoRequiredTier(video, category);
      if (required !== tier) return false;
      return !hasVideoAccess(video, category, ctx);
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function isTierShopTier(tier: ContentTier): tier is TierShopTier {
  return tier === 'sweetie' || tier === 'princess' || tier === 'slut';
}
