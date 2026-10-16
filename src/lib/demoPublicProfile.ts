import { emptyEquipped } from './characterSprite';
import type { PublicProfile } from './profileDb';

/** Reserved id — not a UUID, so it cannot match a real profiles row. */
export const DEMO_PUBLIC_PROFILE_ID = 'demo-public-profile';
export const DEMO_PUBLIC_PROFILE_USERNAME = 'SweetieDemo';
export const DEMO_PUBLIC_PROFILE_PATH = '/u/demo';
export const DEMO_PUBLIC_PROFILE_NOTICE = 'This is a preview profile.';

const DEMO_LOOKUPS = new Set([
  'demo',
  'preview',
  'sweetiedemo',
  DEMO_PUBLIC_PROFILE_ID.toLowerCase(),
]);

export function isDemoPublicProfileLookup(
  lookup: string | null | undefined,
): boolean {
  if (!lookup) return false;
  return DEMO_LOOKUPS.has(lookup.trim().toLowerCase());
}

export function isDemoPublicProfileId(
  userId: string | null | undefined,
): userId is string {
  return userId === DEMO_PUBLIC_PROFILE_ID;
}

export function getDemoPublicProfile(badgeIds: string[] = []): PublicProfile {
  return {
    id: DEMO_PUBLIC_PROFILE_ID,
    username: DEMO_PUBLIC_PROFILE_USERNAME,
    avatarUrl: null,
    bio: "Hi, I'm SweetieDemo — a sample public profile. This description is what visitors see on a member page. Use Send message to try the private-message button.",
    bannerId: 'neon',
    avatarFrameId: 'crown',
    characterGender: 'female',
    characterBreastSize: 'medium',
    characterPenisSize: null,
    characterEquipped: emptyEquipped(),
    lastSeenAt: null,
    currentLevel: 8,
    totalXp: 420,
    streak: 5,
    badgeIds,
  };
}
