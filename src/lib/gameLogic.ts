import type {
  AppState,
  DailyPlan,
  Punishment,
  Task,
} from '../types';
import { todayKey, isYesterday } from './dates';
import { getLevelFromXp } from './levels';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getEligibleDailyTasks(state: AppState): Task[] {
  const level = state.progress.currentLevel;
  return state.tasks.filter(
    (t) => t.frequency === 'daily' && t.minLevel <= level,
  );
}

export function ensureDailyPlan(state: AppState, dateKey?: string): AppState {
  const date = dateKey ?? todayKey(state.settings.resetHour);
  if (state.dailyPlans[date]) return state;

  const eligible = getEligibleDailyTasks(state);
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
  };

  return {
    ...state,
    dailyPlans: { ...state.dailyPlans, [date]: plan },
  };
}

export function getTodayPlan(state: AppState): DailyPlan | undefined {
  const date = todayKey(state.settings.resetHour);
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

export function quotaMet(state: AppState, plan: DailyPlan): boolean {
  const { percent } = completionStats(plan);
  return percent >= state.settings.dailyQuotaPercent;
}

export function completeTask(
  state: AppState,
  taskId: string,
): AppState {
  const date = todayKey(state.settings.resetHour);
  let next = ensureDailyPlan(state, date);
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

  const pointsGain = Math.max(5, Math.floor(task.xpReward / 2));
  let progress = {
    ...next.progress,
    totalXp: next.progress.totalXp + task.xpReward,
    points: next.progress.points + pointsGain,
    lastActiveDate: date,
  };

  progress.currentLevel = getLevelFromXp(progress.totalXp, next.levels);

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
  const date = todayKey(state.settings.resetHour);
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

  const pointsLoss = Math.max(5, Math.floor(task.xpReward / 2));

  return {
    ...state,
    progress: {
      ...state.progress,
      totalXp: Math.max(0, state.progress.totalXp - task.xpReward),
      points: Math.max(0, state.progress.points - pointsLoss),
      currentLevel: getLevelFromXp(
        Math.max(0, state.progress.totalXp - task.xpReward),
        state.levels,
      ),
    },
    dailyPlans: {
      ...state.dailyPlans,
      [date]: { ...plan, tasks: updatedTasks },
    },
  };
}

function punishmentsToday(state: AppState, date: string): Punishment[] {
  return state.punishments.filter((p) => p.date === date && p.active);
}

export function closeDay(state: AppState): AppState {
  const date = todayKey(state.settings.resetHour);
  let next = ensureDailyPlan(state, date);
  const plan = next.dailyPlans[date];
  if (!plan || plan.closed) return next;

  const met = quotaMet(next, plan);
  let updated: AppState = {
    ...next,
    dailyPlans: {
      ...next.dailyPlans,
      [date]: { ...plan, closed: true },
    },
  };

  if (met) {
    updated = applyStreakSuccess(updated, date);
  } else {
    updated = applyPunishments(updated, date);
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
  } else if (isYesterday(last, state.settings.resetHour)) {
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

function applyPunishments(state: AppState, date: string): AppState {
  const existing = punishmentsToday(state, date);
  if (existing.length >= 2) {
    return {
      ...state,
      progress: { ...state.progress, streak: 0 },
    };
  }

  const catalog = state.punishmentTemplates;
  if (catalog.length === 0) {
    return {
      ...state,
      progress: { ...state.progress, streak: 0 },
    };
  }

  const templates = catalog.slice(0, 2 - existing.length);

  const newPunishments: Punishment[] = templates.map((tpl) => ({
    id: generateId(),
    title: tpl.title,
    description: tpl.description,
    trigger: tpl.trigger,
    pointsLost: tpl.pointsLost,
    active: true,
    assignedAt: new Date().toISOString(),
    date,
  }));

  let points = state.progress.points;
  let extraTaskIds: string[] = [];

  for (const p of newPunishments) {
    points = Math.max(0, points - p.pointsLost);
    if (p.title.includes('bonus')) {
      const bonus = state.tasks.find(
        (t) => t.frequency === 'daily' && t.minLevel <= state.progress.currentLevel,
      );
      if (bonus) extraTaskIds.push(bonus.id);
    }
  }

  const plan = state.dailyPlans[date];
  const updatedPlan = plan
    ? { ...plan, extraTaskIds: [...plan.extraTaskIds, ...extraTaskIds] }
    : plan;

  return {
    ...state,
    progress: { ...state.progress, points, streak: 0 },
    punishments: [...state.punishments, ...newPunishments],
    dailyPlans: updatedPlan
      ? { ...state.dailyPlans, [date]: updatedPlan }
      : state.dailyPlans,
  };
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

export function dismissPunishment(state: AppState, id: string): AppState {
  return {
    ...state,
    punishments: state.punishments.map((p) =>
      p.id === id ? { ...p, active: false } : p,
    ),
  };
}

export function processDayRollover(state: AppState): AppState {
  const date = todayKey(state.settings.resetHour);
  const dates = Object.keys(state.dailyPlans).sort();
  const openPast = dates.filter((d) => d < date && !state.dailyPlans[d].closed);

  let next = state;
  for (const d of openPast) {
    next = closeDayForDate(next, d);
  }

  return ensureDailyPlan(next, date);
}

function closeDayForDate(state: AppState, date: string): AppState {
  const plan = state.dailyPlans[date];
  if (!plan || plan.closed) return state;

  const tempSettings = state;
  const fakeState = { ...tempSettings };
  const met = quotaMet(fakeState, plan);

  if (met) {
    return {
      ...state,
      dailyPlans: {
        ...state.dailyPlans,
        [date]: { ...plan, closed: true },
      },
    };
  }

  return applyPunishments(
    {
      ...state,
      dailyPlans: {
        ...state.dailyPlans,
        [date]: { ...plan, closed: true },
      },
    },
    date,
  );
}
