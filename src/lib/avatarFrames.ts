/** Equipable avatar frames (contours around the circular profile photo). */

import type { CosmeticRarity } from './cosmeticRarity';

export const DEFAULT_AVATAR_FRAME_ID = 'none';

export type AvatarFrameId =
  | 'none'
  | 'amethyst'
  | 'neon'
  | 'halo'
  | 'mercury'
  | 'thorns'
  | 'aurora'
  | 'crown'
  | 'flame'
  | 'wings';

export type AvatarFrame = {
  id: AvatarFrameId;
  name: string;
  description: string;
  /** 0 = always owned. Paid frames spend task points. */
  pricePoints: number;
  /** Drives the artwork tier and the shop card treatment. */
  rarity: CosmeticRarity;
  /** Shop card backdrop behind the sample avatar (smooth, same-hue). */
  previewGradient: string;
};

const backdrop = (glow: string, base = '#1d0e30', edge = '#120a1f') =>
  `radial-gradient(circle at 50% 46%, ${glow} 0%, transparent 64%), linear-gradient(165deg, ${base} 0%, ${edge} 100%)`;

/** Ordered by rarity, then price (this is the order shown in the shop). */
export const AVATAR_FRAMES: AvatarFrame[] = [
  {
    id: 'none',
    name: 'None',
    description: 'Bare photo. No contour.',
    pricePoints: 0,
    rarity: 'common',
    previewGradient: backdrop('rgba(168, 120, 220, 0.2)'),
  },
  {
    id: 'amethyst',
    name: 'Amethyst Ring',
    description: 'A clean, polished violet ring. Simple and sharp.',
    pricePoints: 90,
    rarity: 'common',
    previewGradient: backdrop('rgba(192, 132, 252, 0.34)'),
  },
  {
    id: 'neon',
    name: 'Neon Pulse',
    description: 'Twin pink and cyan neon tubes with a soft breathing glow.',
    pricePoints: 180,
    rarity: 'rare',
    previewGradient: backdrop('rgba(232, 121, 249, 0.36)', '#1b0c33', '#0f0a24'),
  },
  {
    id: 'halo',
    name: 'Gilded Halo',
    description: 'A polished gold ring with a fine outer line and a glint.',
    pricePoints: 220,
    rarity: 'rare',
    previewGradient: backdrop('rgba(245, 200, 76, 0.3)', '#241227', '#140b1c'),
  },
  {
    id: 'mercury',
    name: 'Liquid Silver',
    description: 'A chrome ring with beads of mercury clinging to the rim.',
    pricePoints: 260,
    rarity: 'rare',
    previewGradient: backdrop('rgba(203, 213, 225, 0.28)', '#1c1235', '#100c22'),
  },
  {
    id: 'thorns',
    name: 'Thorn Ring',
    description: 'Dark emerald thorns with a slow glint — sharp, not loud.',
    pricePoints: 280,
    rarity: 'epic',
    previewGradient: backdrop('rgba(74, 222, 128, 0.24)', '#16122d', '#0d0b1c'),
  },
  {
    id: 'aurora',
    name: 'Violet Aurora',
    description: 'A jeweled aurora ring with diamond studs and a shimmer.',
    pricePoints: 300,
    rarity: 'epic',
    previewGradient: backdrop('rgba(232, 121, 249, 0.38)', '#25103f', '#130a24'),
  },
  {
    id: 'crown',
    name: 'Gilded Crown',
    description: 'A jeweled gold crown on an engraved gold ring.',
    pricePoints: 320,
    rarity: 'legendary',
    previewGradient: backdrop('rgba(245, 200, 76, 0.4)', '#2a1330', '#150a1e'),
  },
  {
    id: 'flame',
    name: 'Ember Ring',
    description: 'A living ring of layered flames licking the edge.',
    pricePoints: 360,
    rarity: 'legendary',
    previewGradient: backdrop('rgba(249, 115, 22, 0.38)', '#2a1128', '#150a1c'),
  },
  {
    id: 'wings',
    name: 'Seraph Wings',
    description: 'Pearl-and-gold feathered wings on a radiant ring.',
    pricePoints: 520,
    rarity: 'legendary',
    previewGradient: backdrop('rgba(253, 224, 140, 0.42)', '#2a1536', '#150a22'),
  },
];

export const PAID_AVATAR_FRAMES = AVATAR_FRAMES.filter(
  (frame) => frame.pricePoints > 0,
);

export function isAvatarFrameId(value: string): value is AvatarFrameId {
  return AVATAR_FRAMES.some((frame) => frame.id === value);
}

export function parseAvatarFrameId(value: unknown): AvatarFrameId {
  if (typeof value === 'string' && isAvatarFrameId(value)) return value;
  return DEFAULT_AVATAR_FRAME_ID;
}

export function getAvatarFrame(
  id: string | null | undefined,
): AvatarFrame {
  return (
    AVATAR_FRAMES.find((frame) => frame.id === id) ??
    AVATAR_FRAMES.find((frame) => frame.id === DEFAULT_AVATAR_FRAME_ID)!
  );
}

export function isFreeAvatarFrame(id: string): boolean {
  return AVATAR_FRAMES.some(
    (frame) => frame.id === id && frame.pricePoints <= 0,
  );
}

export function ownsAvatarFrame(
  ownedIds: string[] | undefined,
  frameId: string,
): boolean {
  if (isFreeAvatarFrame(frameId)) return true;
  return (ownedIds ?? []).includes(frameId);
}

export function parseOwnedAvatarFrameIds(value: unknown): string[] {
  const ids = new Set<string>([DEFAULT_AVATAR_FRAME_ID]);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && isAvatarFrameId(item.trim())) {
        ids.add(item.trim());
      }
    }
  }
  return [...ids];
}
