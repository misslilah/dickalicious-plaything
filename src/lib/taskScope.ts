import type { AppState, Task, TaskScope } from '../types';
import { parseDateKey } from './dates';

export const TASK_SCOPE_OPTIONS: { value: TaskScope; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'daily', label: 'Daily' },
  { value: 'custom', label: 'Custom' },
];

export const TASK_SCOPE_LABELS: Record<TaskScope, string> = {
  category: 'Category',
  daily: 'Daily',
  custom: 'Custom',
};

/** Stable weekday (0 = Sunday) for weekly-frequency home tasks. */
export function weeklyDayForTask(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = (hash + taskId.charCodeAt(i)) % 7;
  }
  return hash;
}

export function isOnceTaskCompleted(state: AppState, taskId: string): boolean {
  for (const plan of Object.values(state.dailyPlans)) {
    const entry = plan.tasks.find((t) => t.taskId === taskId);
    if (entry?.completed) return true;
  }
  return false;
}

export function frequencyMatchesPlanDate(
  task: Task,
  dateKey: string,
  state: AppState,
): boolean {
  if (task.frequency === 'daily') return true;
  if (task.frequency === 'weekly') {
    return parseDateKey(dateKey).getDay() === weeklyDayForTask(task.id);
  }
  if (task.frequency === 'once') {
    return !isOnceTaskCompleted(state, task.id);
  }
  return false;
}

export function isCategoryScopeTask(task: Task, categoryId: string): boolean {
  return (task.taskScope ?? 'category') === 'category' && task.categoryId === categoryId;
}

export function isHomePlanTask(task: Task, userId: string | null): boolean {
  const scope = task.taskScope ?? 'category';
  if (scope === 'daily') return true;
  if (scope === 'custom' && userId && task.assignedUserId === userId) return true;
  return false;
}
