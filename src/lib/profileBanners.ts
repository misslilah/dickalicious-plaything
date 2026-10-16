/** Profile banner catalog. Free defaults ship with every account; paid ones sell in Shop. */

export type ProfileBanner = {
  id: string;
  name: string;
  description: string;
  /** 0 = free / default. Paid banners use task points. */
  pricePoints: number;
  /** CSS background for the banner strip. */
  gradient: string;
};

export const DEFAULT_BANNER_ID = 'dusk';
export const FREE_BANNER_IDS = ['dusk', 'rose'] as const;

export const PROFILE_BANNERS: ProfileBanner[] = [
  {
    id: 'dusk',
    name: 'Dusk',
    description: 'Soft magenta twilight. Free default.',
    pricePoints: 0,
    gradient:
      'linear-gradient(135deg, #3b1248 0%, #7a1d5a 42%, #c026d3 78%, #f472b6 100%)',
  },
  {
    id: 'rose',
    name: 'Rose',
    description: 'Warm rose gold wash. Free default.',
    pricePoints: 0,
    gradient:
      'linear-gradient(120deg, #4a1530 0%, #9d174d 38%, #fb7185 72%, #fde68a 100%)',
  },
  {
    id: 'void',
    name: 'Void',
    description: 'Deep indigo night with a gold edge.',
    pricePoints: 150,
    gradient:
      'linear-gradient(140deg, #020617 0%, #1e1b4b 45%, #4c1d95 78%, #f5c84c 100%)',
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Electric pink and cyan glow.',
    pricePoints: 220,
    gradient:
      'linear-gradient(125deg, #083344 0%, #0e7490 36%, #e879f9 70%, #22d3ee 100%)',
  },
];

export function getProfileBanner(id: string | null | undefined): ProfileBanner {
  return (
    PROFILE_BANNERS.find((banner) => banner.id === id) ??
    PROFILE_BANNERS.find((banner) => banner.id === DEFAULT_BANNER_ID)!
  );
}

export function isFreeBanner(id: string): boolean {
  return PROFILE_BANNERS.some((banner) => banner.id === id && banner.pricePoints <= 0);
}

export function ownsBanner(ownedIds: string[] | undefined, bannerId: string): boolean {
  if (isFreeBanner(bannerId)) return true;
  return (ownedIds ?? []).includes(bannerId);
}

export function parseOwnedBannerIds(value: unknown): string[] {
  const ids = new Set<string>(FREE_BANNER_IDS);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) ids.add(item.trim());
    }
  }
  return [...ids];
}
