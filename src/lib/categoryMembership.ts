import type { UserStage } from './levels';
import { getUserStage } from './levels';
import type { Category } from '../types';

const STAGE_ORDER: UserStage[] = [
  'beginner',
  'intermediate',
  'trained',
  'mindless',
];

export function stageRank(stage: UserStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/** True if the user's stage meets the category's join requirement. */
export function canJoinCategory(
  category: Category,
  userLevel: number,
): boolean {
  if (!category.requiredStage) return true;
  const userStage = getUserStage(userLevel);
  return stageRank(userStage) >= stageRank(category.requiredStage);
}

export function joinRequirementMessage(category: Category): string {
  if (!category.requiredStage) return '';
  const label =
    category.requiredStage.charAt(0).toUpperCase() +
    category.requiredStage.slice(1);
  return `Requires ${label} stage or higher to join.`;
}
