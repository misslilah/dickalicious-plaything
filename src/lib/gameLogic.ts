import type {
  AppState,
  DailyPlan,
  Punishment,
  PunishmentCategory,
  PunishmentTemplate,
  Task,
} from '../types';
import { DEFAULT_RESET_HOUR } from './constants';
import { todayKey, isYesterday } from './dates';
import { getLevelFromXp, taskMatchesUserStage } from './levels';
import {
  frequencyMatchesPlanDate,
  isHomePlanTask,
} from './taskScope';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getResetHour(state: AppState): number {
  return state.settings.resetHour ?? DEFAULT_RESET_HOUR;
}

export function getEligibleDailyTasks(
  state: AppState,
  userId: string | null = null,
): Task[] {
  const level = state.progress.currentLevel;
  const date = todayKey(getResetHour(state));

  return state.tasks.filter((t) => {
    if (!isHomePlanTask(t, userId)) return false;
    if (!taskMatchesUserStage(t, level)) return false;
    return frequencyMatchesPlanDate(t, date, state);
  });
}

export function ensureDailyPlan(
  state: AppState,
  dateKey?: string,
  userId: string | null = null,
): AppState {
  const date = dateKey ?? todayKey(getResetHour(state));
  const eligible = getEligibleDailyTasks(state, userId);
  const existing = state.dailyPlans[date];

  if (existing) {
    if (existing.closed) return state;

    const existingIds = new Set(existing.tasks.map((t) => t.taskId));
    const missing = eligible.filter((t) => !existingIds.has(t.id));
    if (missing.length === 0) return state;

    return {
      ...state,
      dailyPlans: {
        ...state.dailyPlans,
        [date]: {
          ...existing,
          tasks: [
            ...existing.tasks,
            ...missing.map((t) => ({ taskId: t.id, completed: false })),
          ],
        },
      },
    };
  }

  const yesterday = Object.keys(state.dailyPlans).sort().reverse()[0];
  const prevPlan = yesterday ? state.dailyPlans[yesterday] : undefined;
  const extraIds = prevPlan?.extraTaskIds ?? [];

  const taskIds = [
    ...eligible.map((t) => t.id),
    ...extraIds.filter((id) => !eligible.some((t) => t.id === id)),
  ];

  const uniqueIds = [...new Set(taskIds)];

  const plan: DailyPlan = {
    date,
    tasks: uniqueIds.map((taskId) => ({ taskId, completed: false })),
    closed: false,
    extraTaskIds: [],
    startedTaskIds: [],
  };

  return {
    ...state,
    dailyPlans: { ...state.dailyPlans, [date]: plan },
  };
}

export function getTodayPlan(state: AppState): DailyPlan | undefined {
  const date = todayKey(getResetHour(state));
  return state.dailyPlans[date];
}

export function completionStats(plan: DailyPlan | undefined): {
  total: number;
  completed: number;
  percent: number;
} {
  if (!plan || plan.tasks.length === 0) {
    return { total: 0, completed: 0, percent: 0 };
  }
  const completed = plan.tasks.filter((t) => t.completed).length;
  const total = plan.tasks.length;
  return {
    total,
    completed,
    percent: Math.round((completed / total) * 100),
  };
}

/** All daily plan tasks completed (replaces legacy quota for streak). */
export function dayFullyCompleted(plan: DailyPlan): boolean {
  if (plan.tasks.length === 0) return true;
  return plan.tasks.every((t) => t.completed);
}

function normalizeStartedIds(plan: DailyPlan): string[] {
  return plan.startedTaskIds ?? [];
}

export function markTaskStarted(state: AppState, taskId: string): AppState {
  const date = todayKey(getResetHour(state));
  let next = ensureDailyPlan(state, date);
  const plan = next.dailyPlans[date];
  if (!plan || plan.closed) return next;

  const started = normalizeStartedIds(plan);
  if (started.includes(taskId)) return next;

  return {
    ...next,
    dailyPlans: {
      ...next.dailyPlans,
      [date]: { ...plan, startedTaskIds: [...started, taskId] },
    },
  };
}

function malusForIncompletePlanTasks(
  state: AppState,
  plan: DailyPlan,
): number {
  const started = new Set(normalizeStartedIds(plan));
  let total = 0;

  for (const entry of plan.tasks) {
    if (entry.completed) continue;
    const task = state.tasks.find((t) => t.id === entry.taskId);
    if (!task) continue;
    const scope = task.taskScope ?? 'category';
    if (scope === 'category' && !started.has(entry.taskId)) continue;
    total += task.malusPointsOnFail ?? 0;
  }

  return total;
}

function applyMalus(state: AppState, amount: number): AppState {
  if (amount <= 0) return state;
  return {
    ...state,
    progress: {
      ...state.progress,
      malusPoints: state.progress.malusPoints + amount,
    },
  };
}

/** Apply this task's malus_points_on_fail to the user's malus balance (e.g. phrase challenge failed). */
export function applyTaskMalus(state: AppState, taskId: string): AppState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return state;
  return applyMalus(state, task.malusPointsOnFail ?? 0);
}

export function completeTask(
  state: AppState,
  taskId: string,
  userId: string | null = null,
): AppState {
  const date = todayKey(getResetHour(state));
  let next = markTaskStarted(ensureDailyPlan(state, date, userId), taskId);
  const plan = next.dailyPlans[date];
  if (!plan || plan.closed) return next;

  const task = next.tasks.find((t) => t.id === taskId);
  if (!task) return next;

  const entry = plan.tasks.find((t) => t.taskId === taskId);
  if (!entry || entry.completed) return next;

  const updatedTasks = plan.tasks.map((t) =>
    t.taskId === taskId
      ? { ...t, completed: true, completedAt: new Date().toISOString() }
      : t,
  );

  const pointsGain = task.pointsReward ?? 0;
  let progress = {
    ...next.progress,
    totalXp: next.progress.totalXp + task.xpReward,
    points: next.progress.points + pointsGain,
    lastActiveDate: date,
  };

  progress.currentLevel = getLevelFromXp(progress.totalXp);

  next = {
    ...next,
    progress,
    dailyPlans: {
      ...next.dailyPlans,
      [date]: { ...plan, tasks: updatedTasks },
    },
  };

  next = checkAutoRewards(next);
  return next;
}

export function uncompleteTask(state: AppState, taskId: string): AppState {
  const date = todayKey(getResetHour(state));
  const plan = state.dailyPlans[date];
  if (!plan || plan.closed) return state;

  const task = state.tasks.find((t) => t.id === taskId);
  const entry = plan.tasks.find((t) => t.taskId === taskId);
  if (!entry?.completed || !task) return state;

  const updatedTasks = plan.tasks.map((t) =>
    t.taskId === taskId
      ? { taskId, completed: false }
      : t,
  );

  const pointsLoss = task.pointsReward ?? 0;

  return {
    ...state,
    progress: {
      ...state.progress,
      totalXp: Math.max(0, state.progress.totalXp - task.xpReward),
      points: Math.max(0, state.progress.points - pointsLoss),
      currentLevel: getLevelFromXp(
        Math.max(0, state.progress.totalXp - task.xpReward),
      ),
    },
    dailyPlans: {
      ...state.dailyPlans,
      [date]: { ...plan, tasks: updatedTasks },
    },
  };
}

export function closeDay(
  state: AppState,
  userId: string | null = null,
): AppState {
  const date = todayKey(getResetHour(state));
  let next = ensureDailyPlan(state, date, userId);
  const plan = next.dailyPlans[date];
  if (!plan || plan.closed) return next;

  const malusGain = malusForIncompletePlanTasks(next, plan);
  let updated: AppState = {
    ...next,
    dailyPlans: {
      ...next.dailyPlans,
      [date]: { ...plan, closed: true },
    },
  };

  updated = applyMalus(updated, malusGain);

  if (malusGain === 0 && dayFullyCompleted(plan)) {
    updated = applyStreakSuccess(updated, date);
  } else if (malusGain > 0) {
    updated = {
      ...updated,
      progress: { ...updated.progress, streak: 0 },
    };
  }

  return updated;
}

function applyStreakSuccess(state: AppState, date: string): AppState {
  const last = state.progress.lastActiveDate;
  let streak = state.progress.streak;

  if (!last) {
    streak = 1;
  } else if (last === date) {
    // already counted today
  } else if (isYesterday(last, getResetHour(state))) {
    streak += 1;
  } else {
    streak = 1;
  }

  let next: AppState = {
    ...state,
    progress: {
      ...state.progress,
      streak,
      lastActiveDate: date,
    },
  };

  next = checkAutoRewards(next);
  return next;
}

function checkAutoRewards(state: AppState): AppState {
  const unlocked = new Set(state.unlockedRewardIds);
  let changed = false;

  for (const reward of state.rewards) {
    if (!reward.autoTrigger || unlocked.has(reward.id)) continue;

    const trigger = reward.autoTrigger;
    let earned = false;

    if (trigger.type === 'streak' && state.progress.streak >= trigger.days) {
      earned = true;
    }
    if (
      trigger.type === 'level' &&
      state.progress.currentLevel >= trigger.level
    ) {
      earned = true;
    }

    if (earned) {
      unlocked.add(reward.id);
      changed = true;
    }
  }

  if (!changed) return state;
  return { ...state, unlockedRewardIds: [...unlocked] };
}

export function purchaseReward(state: AppState, rewardId: string): AppState {
  const reward = state.rewards.find((r) => r.id === rewardId);
  if (!reward?.cost || state.unlockedRewardIds.includes(rewardId)) {
    return state;
  }
  if (state.progress.points < reward.cost) return state;

  return {
    ...state,
    progress: {
      ...state.progress,
      points: state.progress.points - reward.cost,
    },
    unlockedRewardIds: [...state.unlockedRewardIds, rewardId],
  };
}

export function acceptPunishment(
  state: AppState,
  templateId: string,
): AppState {
  if (state.progress.malusPoints <= 0) return state;

  const template = state.punishmentTemplates.find((t) => t.id === templateId);
  if (!template) return state;

  const relieved = template.malusPointsRelieved;
  const newMalus = Math.max(0, state.progress.malusPoints - relieved);
  const date = todayKey(getResetHour(state));

  const entry: Punishment = {
    id: generateId(),
    title: template.title,
    description: template.description,
    trigger: { type: 'malus_relief' },
    pointsLost: 0,
    active: false,
    assignedAt: new Date().toISOString(),
    date,
  };

  return {
    ...state,
    progress: { ...state.progress, malusPoints: newMalus },
    punishments: [...state.punishments, entry],
  };
}

export function dismissPunishment(state: AppState, id: string): AppState {
  return {
    ...state,
    punishments: state.punishments.map((p) =>
      p.id === id ? { ...p, active: false } : p,
    ),
  };
}

export function processDayRollover(
  state: AppState,
  userId: string | null = null,
): AppState {
  const date = todayKey(getResetHour(state));
  const dates = Object.keys(state.dailyPlans).sort();
  const openPast = dates.filter((d) => d < date && !state.dailyPlans[d].closed);

  let next = state;
  for (const d of openPast) {
    next = closeDayForDate(next, d);
  }

  return ensureDailyPlan(next, date, userId);
}

function closeDayForDate(state: AppState, date: string): AppState {
  const plan = state.dailyPlans[date];
  if (!plan || plan.closed) return state;

  const malusGain = malusForIncompletePlanTasks(state, plan);
  let updated: AppState = {
    ...state,
    dailyPlans: {
      ...state.dailyPlans,
      [date]: { ...plan, closed: true },
    },
  };

  updated = applyMalus(updated, malusGain);

  if (malusGain === 0 && dayFullyCompleted(plan)) {
    updated = applyStreakSuccess(updated, date);
  } else if (malusGain > 0) {
    updated = {
      ...updated,
      progress: { ...updated.progress, streak: 0 },
    };
  }

  return updated;
}

export const PUNISHMENT_DIFFICULTY_ORDER = ['easy', 'medium', 'hard'] as const;

export const PUNISHMENT_DIFFICULTY_LABELS: Record<
  (typeof PUNISHMENT_DIFFICULTY_ORDER)[number],
  string
> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export function categoryDifficulty(
  category: PunishmentCategory,
): (typeof PUNISHMENT_DIFFICULTY_ORDER)[number] {
  if (category.difficulty) return category.difficulty;
  const name = category.name.trim().toLowerCase();
  if (name === 'easy' || name === 'medium' || name === 'hard') return name;
  return 'medium';
}

export function groupCategoriesByDifficulty(
  categories: PunishmentCategory[],
): Record<(typeof PUNISHMENT_DIFFICULTY_ORDER)[number], PunishmentCategory[]> {
  const groups: Record<
    (typeof PUNISHMENT_DIFFICULTY_ORDER)[number],
    PunishmentCategory[]
  > = { easy: [], medium: [], hard: [] };
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const c of sorted) {
    groups[categoryDifficulty(c)].push(c);
  }
  return groups;
}

export function templatesForCategory(
  templates: PunishmentTemplate[],
  categories: PunishmentCategory[],
  categoryId: string,
): PunishmentTemplate[] {
  return templates.filter(
    (t) => resolvePunishmentCategoryId(t, categories) === categoryId,
  );
}

export function resolvePunishmentCategoryId(
  template: PunishmentTemplate,
  categories: PunishmentCategory[],
): string | null {
  if (template.categoryId) return template.categoryId;
  const difficulty = template.difficulty ?? 'medium';
  const match = categories.find((c) => c.name.toLowerCase() === difficulty);
  return match?.id ?? null;
}

export function groupPunishmentsByCategory(
  templates: PunishmentTemplate[],
  categories: PunishmentCategory[],
  options?: { includeEmpty?: boolean },
): { category: PunishmentCategory; templates: PunishmentTemplate[] }[] {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const buckets = new Map<string, PunishmentTemplate[]>(
    sorted.map((c) => [c.id, []]),
  );
  const uncategorized: PunishmentTemplate[] = [];

  for (const t of templates) {
    const catId = resolvePunishmentCategoryId(t, sorted);
    if (catId && buckets.has(catId)) {
      buckets.get(catId)!.push(t);
    } else {
      uncategorized.push(t);
    }
  }

  const groups = sorted
    .map((category) => ({
      category,
      templates: buckets.get(category.id) ?? [],
    }))
    .filter((g) => options?.includeEmpty || g.templates.length > 0);

  if (uncategorized.length > 0) {
    groups.push({
      category: {
        id: '__uncategorized__',
        name: 'Other',
        sortOrder: 9999,
      },
      templates: uncategorized,
    });
  }

  return groups;
}

/** @deprecated Use groupPunishmentsByCategory */
export function groupPunishmentTemplates(
  templates: PunishmentTemplate[],
): Record<string, PunishmentTemplate[]> {
  const groups: Record<string, PunishmentTemplate[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const t of templates) {
    const key = t.difficulty ?? 'medium';
    if (groups[key]) groups[key].push(t);
  }
  return groups;
}
