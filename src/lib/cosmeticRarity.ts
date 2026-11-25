/** Shared rarity tiers for every cosmetic (banners, frames, videos, rewards). */

export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const COSMETIC_RARITIES: CosmeticRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
];

export const COSMETIC_RARITY_LABEL: Record<CosmeticRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const COSMETIC_RARITY_RANK: Record<CosmeticRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

/** Default tier from a point price (used by banners, frames, rewards). */
export function rarityFromCost(cost: number): CosmeticRarity {
  if (cost <= 0) return 'common';
  if (cost < 200) return 'rare';
  if (cost < 400) return 'epic';
  return 'legendary';
}
