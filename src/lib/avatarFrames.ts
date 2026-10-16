/** Equipable avatar frames (contours around the circular profile photo). */

export const DEFAULT_AVATAR_FRAME_ID = 'none';

export type AvatarFrameId =
  | 'none'
  | 'crown'
  | 'mercury'
  | 'flame'
  | 'halo'
  | 'neon'
  | 'thorns';

export type AvatarFrame = {
  id: AvatarFrameId;
  name: string;
  description: string;
  /** 0 = always owned. Paid frames spend task points. */
  pricePoints: number;
  previewGradient: string;
};

export const AVATAR_FRAMES: AvatarFrame[] = [
  {
    id: 'none',
    name: 'None',
    description: 'Bare photo. No contour.',
    pricePoints: 0,
    previewGradient:
      'linear-gradient(145deg, #2a163a 0%, #1c1028 55%, #3b1248 100%)',
  },
  {
    id: 'crown',
    name: 'Gilded Crown',
    description: 'A small gold crown resting on the circle.',
    pricePoints: 320,
    previewGradient:
      'linear-gradient(160deg, #422006 0%, #a16207 42%, #f5c84c 78%, #fff7d6 100%)',
  },
  {
    id: 'mercury',
    name: 'Liquid Silver',
    description: 'A white mercury ring that flows around the photo.',
    pricePoints: 260,
    previewGradient:
      'linear-gradient(145deg, #0f172a 0%, #64748b 48%, #e2e8f0 78%, #ffffff 100%)',
  },
  {
    id: 'flame',
    name: 'Ember Ring',
    description: 'Soft flames licking the edge of the circle.',
    pricePoints: 360,
    previewGradient:
      'linear-gradient(165deg, #431407 0%, #c2410c 40%, #f97316 70%, #fde047 100%)',
  },
  {
    id: 'halo',
    name: 'Gilded Halo',
    description: 'A quiet gold halo sitting behind the photo.',
    pricePoints: 220,
    previewGradient:
      'linear-gradient(140deg, #1c1008 0%, #854d0e 45%, #f5c84c 78%, #fef9c3 100%)',
  },
  {
    id: 'neon',
    name: 'Neon Pulse',
    description: 'Pink and cyan glow hugging the circle.',
    pricePoints: 180,
    previewGradient:
      'linear-gradient(125deg, #083344 0%, #0e7490 36%, #e879f9 70%, #22d3ee 100%)',
  },
  {
    id: 'thorns',
    name: 'Thorn Ring',
    description: 'Dark thorns wrapping the rim — sharp, not loud.',
    pricePoints: 280,
    previewGradient:
      'linear-gradient(150deg, #052e16 0%, #14532d 42%, #86efac 78%, #ecfccb 100%)',
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
