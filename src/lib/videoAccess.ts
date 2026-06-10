import { canAccessTier, effectiveVideoTier } from './tiers';
import type {
  ContentTier,
  PatreonMemberTier,
  PatreonStatus,
  Video,
  VideoCategory,
} from '../types';

export interface InteractiveVideoTierAccess {
  requiredTier?: ContentTier | null;
}

export interface VideoAccessContext {
  patreonTier: PatreonMemberTier | null | undefined;
  patreonStatus: PatreonStatus | null | undefined;
  isAdmin?: boolean;
  purchasedVideoIds: readonly string[];
}

export function hasPurchasedVideo(
  videoId: string,
  purchasedVideoIds: readonly string[],
): boolean {
  return purchasedVideoIds.includes(videoId);
}

export function canWatchVideo(
  video: Video,
  category: VideoCategory | undefined,
  ctx: VideoAccessContext,
): boolean {
  if (ctx.isAdmin) return true;
  if (hasPurchasedVideo(video.id, ctx.purchasedVideoIds)) return true;
  const required = effectiveVideoTier(video.requiredTier, category?.requiredTier);
  return canAccessTier(
    required,
    ctx.patreonTier,
    ctx.patreonStatus,
    false,
  );
}

export function canAccessVideoCategory(
  category: VideoCategory,
  videosInCategory: Video[],
  ctx: VideoAccessContext,
): boolean {
  if (ctx.isAdmin) return true;
  if (
    canAccessTier(
      category.requiredTier ?? 'public',
      ctx.patreonTier,
      ctx.patreonStatus,
      false,
    )
  ) {
    return true;
  }
  return videosInCategory.some((v) => hasPurchasedVideo(v.id, ctx.purchasedVideoIds));
}

export function isVideoShopPurchasable(video: Video): boolean {
  return (video.shopPointsCost ?? 0) > 0;
}

export function hasVideoAccess(
  video: Video,
  category: VideoCategory | undefined,
  ctx: VideoAccessContext,
): boolean {
  return canWatchVideo(video, category, ctx);
}

export function videoRequiredTier(
  video: Video,
  category: VideoCategory | undefined,
): ContentTier {
  return effectiveVideoTier(video.requiredTier, category?.requiredTier);
}

export function interactiveVideoRequiredTier(
  video: InteractiveVideoTierAccess,
): ContentTier {
  return video.requiredTier ?? 'sweetie';
}

export function canWatchInteractiveVideo(
  video: InteractiveVideoTierAccess,
  ctx: VideoAccessContext,
): boolean {
  if (ctx.isAdmin) return true;
  return canAccessTier(
    interactiveVideoRequiredTier(video),
    ctx.patreonTier,
    ctx.patreonStatus,
    false,
  );
}
