import type { AppState, RecurringTaskCompletion, Task, TaskRecurrence } from '../types';
import { DEFAULT_RESET_HOUR } from './constants';
import { formatDateKey, parseDateKey, todayKey } from './dates';

function getResetHour(state: AppState): number {
  return state.settings.resetHour ?? DEFAULT_RESET_HOUR;
}

export const TASK_RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
};

export function isRecurringCategoryTask(task: Task): boolean {
  return (task.recurrence ?? 'none') !== 'none';
}

export function isRecurringTaskAccepted(state: AppState, taskId: string): boolean {
  return (state.acceptedRecurringTaskIds ?? []).includes(taskId);
}

export function weekPeriodKey(resetHour = 0, referenceDate?: string): string {
  const today = parseDateKey(referenceDate ?? todayKey(resetHour));
  const day = today.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  return formatDateKey(monday);
}

export function getRecurringPeriodKey(
  task: Task,
  resetHour = 0,
  referenceDate?: string,
): string {
  const recurrence = task.recurrence ?? 'none';
  if (recurrence === 'weekly') {
    return weekPeriodKey(resetHour, referenceDate);
  }
  if (recurrence === 'daily') {
    return referenceDate ?? todayKey(resetHour);
  }
  return referenceDate ?? todayKey(resetHour);
}

export function isRecurringPeriodComplete(
  state: AppState,
  taskId: string,
  periodKey: string,
): boolean {
  return (state.recurringTaskCompletions ?? []).some(
    (entry) => entry.taskId === taskId && entry.periodKey === periodKey,
  );
}

export function isRecurringTaskDue(state: AppState, task: Task): boolean {
  if (!isRecurringCategoryTask(task)) return false;
  if (!isRecurringTaskAccepted(state, task.id)) return false;
  const resetHour = getResetHour(state);
  const periodKey = getRecurringPeriodKey(task, resetHour);
  return !isRecurringPeriodComplete(state, task.id, periodKey);
}

export function isRecurringTaskCompleteForPeriod(
  state: AppState,
  task: Task,
): boolean {
  if (!isRecurringCategoryTask(task)) return false;
  const resetHour = getResetHour(state);
  const periodKey = getRecurringPeriodKey(task, resetHour);
  return isRecurringPeriodComplete(state, task.id, periodKey);
}

export function countRecurringCompletionsInWeek(
  state: AppState,
  taskId: string,
  resetHour = 0,
): { completed: number; total: number } {
  const weekStart = weekPeriodKey(resetHour);
  const weekStartDate = parseDateKey(weekStart);
  const keys: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);
    keys.push(formatDateKey(d));
  }
  const completed = keys.filter((key) =>
    isRecurringPeriodComplete(state, taskId, key),
  ).length;
  return { completed, total: 7 };
}

export function getRecurringTaskStatusLabel(state: AppState, task: Task): string | null {
  const recurrence = task.recurrence ?? 'none';
  if (recurrence === 'none') return null;
  if (!isRecurringTaskAccepted(state, task.id)) {
    return 'Accept to start';
  }
  if (recurrence === 'daily') {
    if (isRecurringTaskCompleteForPeriod(state, task)) {
      return 'Completed today ✓';
    }
    const { completed, total } = countRecurringCompletionsInWeek(state, task.id);
    return `${completed}/${total} days this week`;
  }
  if (recurrence === 'weekly') {
    if (isRecurringTaskCompleteForPeriod(state, task)) {
      return 'Completed this week ✓';
    }
    return 'Due this week';
  }
  return null;
}

export function appendRecurringCompletion(
  completions: RecurringTaskCompletion[],
  taskId: string,
  periodKey: string,
): RecurringTaskCompletion[] {
  if (completions.some((c) => c.taskId === taskId && c.periodKey === periodKey)) {
    return completions;
  }
  return [
    ...completions,
    { taskId, periodKey, completedAt: new Date().toISOString() },
  ];
}

export function clearRecurringDataForTasks(
  state: AppState,
  taskIds: Set<string>,
): Pick<AppState, 'acceptedRecurringTaskIds' | 'recurringTaskCompletions'> {
  return {
    acceptedRecurringTaskIds: (state.acceptedRecurringTaskIds ?? []).filter(
      (id) => !taskIds.has(id),
    ),
    recurringTaskCompletions: (state.recurringTaskCompletions ?? []).filter(
      (entry) => !taskIds.has(entry.taskId),
    ),
  };
}
