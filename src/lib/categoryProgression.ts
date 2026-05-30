import type { AppState, Category, CategoryGroup } from '../types';
import { getUserStage } from './levels';
import { isOnceTaskCompleted } from './taskScope';
import { isCategoryScopeTask } from './taskScope';

export const MAX_ACTIVE_CATEGORY_JOINS = 3;

export const CATEGORY_GROUP_ORDER: CategoryGroup[] = [
  'all',
  'beginner',
  'intermediate',
  'trained',
  'mindless',
];

/** @alias CATEGORY_GROUP_ORDER */
export const CATEGORY_GROUPS = CATEGORY_GROUP_ORDER;

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  all: 'All',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  trained: 'Trained',
  mindless: 'Mindless',
};

const TIER_GROUPS: CategoryGroup[] = [
  'beginner',
  'intermediate',
  'trained',
  'mindless',
];

type CategoryWithLegacyGroup = Category & {
  category_group?: CategoryGroup | string | null;
};

function normalizeCategoryGroup(
  value: string | null | undefined,
): CategoryGroup | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim() as CategoryGroup;
  return CATEGORY_GROUP_ORDER.includes(normalized) ? normalized : null;
}

export function getCategoryGroup(category: Category): CategoryGroup {
  const legacy = category as CategoryWithLegacyGroup;
  const raw = category.categoryGroup ?? legacy.category_group ?? null;
  return normalizeCategoryGroup(raw) ?? 'beginner';
}

export function getCategoryTasks(state: AppState, categoryId: string) {
  return state.tasks.filter((t) => isCategoryScopeTask(t, categoryId));
}

export function isCategoryTaskEverCompleted(
  state: AppState,
  taskId: string,
): boolean {
  return isOnceTaskCompleted(state, taskId);
}

export function getCategoryCompletionStats(
  state: AppState,
  categoryId: string,
): { completed: number; total: number; percent: number } {
  const tasks = getCategoryTasks(state, categoryId);
  if (tasks.length === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }
  const completed = tasks.filter((t) =>
    isCategoryTaskEverCompleted(state, t.id),
  ).length;
  return {
    completed,
    total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100),
  };
}

export function getCategoryCompletionPercent(
  state: AppState,
  categoryId: string,
): number {
  return getCategoryCompletionStats(state, categoryId).percent;
}

export function isCategoryFullyComplete(
  state: AppState,
  categoryId: string,
): boolean {
  const { total, percent } = getCategoryCompletionStats(state, categoryId);
  if (total === 0) return false;
  return percent >= 100;
}

export function hasCompletedCategoryInGroup(
  state: AppState,
  group: CategoryGroup,
): boolean {
  return state.categories.some(
    (c) =>
      getCategoryGroup(c) === group && isCategoryFullyComplete(state, c.id),
  );
}

export function getPreviousTierGroup(
  group: CategoryGroup,
): CategoryGroup | null {
  if (group === 'all') return null;
  const idx = TIER_GROUPS.indexOf(group);
  if (idx <= 0) return null;
  return TIER_GROUPS[idx - 1] ?? null;
}

export function isTierGroupUnlocked(
  state: AppState,
  group: CategoryGroup,
): boolean {
  if (group === 'all' || group === 'beginner') return true;
  const prev = getPreviousTierGroup(group);
  if (!prev) return true;
  return hasCompletedCategoryInGroup(state, prev);
}

export function isCategoryUnlocked(state: AppState, category: Category): boolean {
  if (category.unlockAfterCategoryId) {
    return isCategoryFullyComplete(state, category.unlockAfterCategoryId);
  }

  const group = getCategoryGroup(category);
  if (group === 'all' || group === 'beginner') return true;

  const prev = getPreviousTierGroup(group);
  if (!prev) return true;
  return hasCompletedCategoryInGroup(state, prev);
}

export function getCategoryUnlockBlockReason(
  state: AppState,
  category: Category,
): string | null {
  if (isCategoryUnlocked(state, category)) return null;

  if (category.unlockAfterCategoryId) {
    const prereq = state.categories.find(
      (c) => c.id === category.unlockAfterCategoryId,
    );
    return prereq
      ? `Complete "${prereq.name}" first.`
      : 'Complete the required category first.';
  }

  const group = getCategoryGroup(category);
  const prev = getPreviousTierGroup(group);
  if (prev) {
    return `Complete any ${CATEGORY_GROUP_LABELS[prev]} category first.`;
  }

  return 'This category is locked.';
}

export function joinRequirementMessage(category: Category): string {
  if (!category.requiredStage) return '';
  const label =
    category.requiredStage.charAt(0).toUpperCase() +
    category.requiredStage.slice(1);
  return `Requires ${label} stage or higher to join.`;
}

const STAGE_ORDER = ['beginner', 'intermediate', 'trained', 'mindless'] as const;

function stageRank(stage: (typeof STAGE_ORDER)[number]): number {
  return STAGE_ORDER.indexOf(stage);
}

export function canJoinCategory(
  state: AppState,
  category: Category,
  userLevel: number,
): { ok: true } | { ok: false; reason: string } {
  if (!isCategoryUnlocked(state, category)) {
    return {
      ok: false,
      reason: getCategoryUnlockBlockReason(state, category) ?? 'Locked.',
    };
  }

  if (category.requiredStage) {
    const userStage = getUserStage(userLevel);
    if (stageRank(userStage) < stageRank(category.requiredStage)) {
      return { ok: false, reason: joinRequirementMessage(category) };
    }
  }

  if (state.joinedCategoryIds.includes(category.id)) {
    return { ok: false, reason: 'Already joined.' };
  }

  if (state.joinedCategoryIds.length >= MAX_ACTIVE_CATEGORY_JOINS) {
    return {
      ok: false,
      reason: `You can only join up to ${MAX_ACTIVE_CATEGORY_JOINS} categories at once.`,
    };
  }

  return { ok: true };
}

export function groupCategoriesByTier(categories: Category[]) {
  const map = new Map<CategoryGroup, Category[]>(
    CATEGORY_GROUP_ORDER.map((group) => [group, []]),
  );
  for (const cat of categories) {
    const group = getCategoryGroup(cat);
    map.get(group)!.push(cat);
  }
  return map;
}
