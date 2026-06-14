import type { AppState, Category, CategoryGroup, Task } from '../types';
import { getUserStage } from './levels';
import { isOnceTaskCompleted } from './taskScope';
import { isCategoryScopeTask } from './taskScope';

export const MAX_ACTIVE_CATEGORY_JOINS = 3;
export const TIER_UNLOCK_PERCENT = 70;

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

export function getCategoryTasks(state: AppState, categoryId: string): Task[] {
  return sortCategoryTasks(
    state.tasks.filter((t) => isCategoryScopeTask(t, categoryId)),
  );
}

export function getRegularCategoryTasks(
  state: AppState,
  categoryId: string,
): Task[] {
  return getCategoryTasks(state, categoryId).filter((t) => !t.isExamTask);
}

export function getExamCategoryTasks(
  state: AppState,
  categoryId: string,
): Task[] {
  return getCategoryTasks(state, categoryId).filter((t) => t.isExamTask);
}

export function sortCategoryTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const orderA = a.sortOrder ?? 0;
    const orderB = b.sortOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });
}

export function isCategoryTaskEverCompleted(
  state: AppState,
  taskId: string,
): boolean {
  return isOnceTaskCompleted(state, taskId);
}

export function areRegularCategoryTasksComplete(
  state: AppState,
  categoryId: string,
): boolean {
  const tasks = getRegularCategoryTasks(state, categoryId);
  if (tasks.length === 0) return true;
  return tasks.every((t) => isCategoryTaskEverCompleted(state, t.id));
}

/** Tasks that count toward visible category progress (exam tasks unlock after regular tasks). */
export function getCountableCategoryTasks(
  state: AppState,
  categoryId: string,
): Task[] {
  const regular = getRegularCategoryTasks(state, categoryId);
  if (!areRegularCategoryTasksComplete(state, categoryId)) {
    return regular;
  }
  return [...regular, ...getExamCategoryTasks(state, categoryId)];
}

export function getCategoryCompletionStats(
  state: AppState,
  categoryId: string,
): { completed: number; total: number; percent: number } {
  const tasks = getCountableCategoryTasks(state, categoryId);
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
  const regular = getRegularCategoryTasks(state, categoryId);
  const exams = getExamCategoryTasks(state, categoryId);
  if (regular.length === 0 && exams.length === 0) return false;

  const regularDone = regular.every((t) =>
    isCategoryTaskEverCompleted(state, t.id),
  );
  if (!regularDone) return false;
  if (exams.length === 0) return true;
  return exams.every((t) => isCategoryTaskEverCompleted(state, t.id));
}

export function getTierGroupStats(
  state: AppState,
  group: CategoryGroup,
): { completed: number; total: number; percent: number } {
  const cats = state.categories.filter((c) => getCategoryGroup(c) === group);
  if (cats.length === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }
  const completed = cats.filter((c) =>
    isCategoryFullyComplete(state, c.id),
  ).length;
  return {
    completed,
    total: cats.length,
    percent: Math.round((completed / cats.length) * 100),
  };
}

export function getTierUnlockProgressLabel(
  state: AppState,
  group: CategoryGroup,
): string | null {
  const prev = getPreviousTierGroup(group);
  if (!prev) return null;
  const stats = getTierGroupStats(state, prev);
  if (stats.total === 0) return null;
  const need = TIER_UNLOCK_PERCENT;
  return `${stats.percent}% of ${CATEGORY_GROUP_LABELS[prev]} categories completed (need ${need}% to unlock ${CATEGORY_GROUP_LABELS[group]})`;
}

export function hasCompletedCategoryInGroup(
  state: AppState,
  group: CategoryGroup,
): boolean {
  return getTierGroupStats(state, group).percent >= TIER_UNLOCK_PERCENT;
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

  return isTierGroupUnlocked(state, group);
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
    const stats = getTierGroupStats(state, prev);
    return `Complete at least ${TIER_UNLOCK_PERCENT}% of ${CATEGORY_GROUP_LABELS[prev]} categories first (${stats.percent}% done).`;
  }

  return 'This category is locked.';
}

export function isTaskPrerequisiteMet(state: AppState, task: Task): boolean {
  if (!task.prerequisiteTaskId) return true;
  return isCategoryTaskEverCompleted(state, task.prerequisiteTaskId);
}

/** Same-category tasks eligible as prerequisites (excludes self; regular tasks cannot require exam tasks). */
export function getPrerequisiteTaskOptions(
  tasks: Task[],
  categoryId: string,
  editingTaskId: string,
  forExamTask: boolean,
): Task[] {
  return tasks
    .filter(
      (t) =>
        t.categoryId === categoryId &&
        t.id !== editingTaskId &&
        (forExamTask || !t.isExamTask),
    )
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.title.localeCompare(b.title),
    );
}

export function getPrerequisiteTaskLabel(
  task: Task,
  tasks: Task[],
): string | null {
  if (!task.prerequisiteTaskId) return null;
  const prereq = tasks.find((t) => t.id === task.prerequisiteTaskId);
  return prereq ? prereq.title : null;
}

export function isExamTaskUnlocked(
  state: AppState,
  task: Task,
  categoryId: string,
): boolean {
  if (!task.isExamTask) return true;
  return areRegularCategoryTasksComplete(state, categoryId);
}

export function isCategoryTaskAvailable(
  state: AppState,
  task: Task,
  categoryId: string,
): boolean {
  if (!isCategoryScopeTask(task, categoryId)) return false;
  if (!isExamTaskUnlocked(state, task, categoryId)) return false;
  return isTaskPrerequisiteMet(state, task);
}

export function getCategoryTaskBlockReason(
  state: AppState,
  task: Task,
  categoryId: string,
): string {
  if (task.isExamTask && !areRegularCategoryTasksComplete(state, categoryId)) {
    return 'Complete all regular tasks to unlock exam tasks.';
  }
  if (task.prerequisiteTaskId && !isTaskPrerequisiteMet(state, task)) {
    const prereq = state.tasks.find((t) => t.id === task.prerequisiteTaskId);
    return prereq
      ? `Complete "${prereq.title}" first.`
      : 'Complete the required task first.';
  }
  return 'This task is locked.';
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
