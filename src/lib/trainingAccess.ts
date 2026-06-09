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
  'Je certifie léguer l\'entiereté de mon entrainement à ma maitresse ainsi que tout ce qui sera nécessaire pour mon apprentissage';
