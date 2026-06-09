import type { PatreonMemberTier, PatreonStatus } from '../types';
import { canAccessTier } from './tiers';

/** Slut-tier patrons (active) and admins may access Training. */
export function canAccessTraining(
  patreonTier: PatreonMemberTier | null | undefined,
  patreonStatus: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): boolean {
  return canAccessTier('slut', patreonTier, patreonStatus, isAdmin);
}

export const TRAINING_CERTIFICATION_TEXT =
  'I certify that I entrust my entire training to my Mistress, including everything required for my development.';

export const BLACKMAIL_CERTIFICATION_TEXT =
  'I certify that I grant my Mistress access to my photos and consent to all usage of those images within our dynamic.';

export const BLACKMAIL_CERTIFICATION_FINE_PRINT =
  'This is fictional roleplay content.';
