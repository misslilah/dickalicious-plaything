import type { AppState, Badge, Task } from '../types';
import { unlockBadgeForUser } from './badgeDb';
import { isCategoryFullyComplete } from './categoryProgression';
import {
  incrementBadgeAccumulatedSeconds,
  markBadgeProgressComplete,
} from './badgeProgressDb';
import { isCategoryScopeTask } from './taskScope';

export function badgeAppliesToTask(badge: Badge, task: Task): boolean {
  const req = badge.requirement;
  if (!req) return false;
  if (req.type === 'task') return req.taskId === task.id;
  if (req.type === 'category' && req.categoryId && task.categoryId) {
    return isCategoryScopeTask(task, req.categoryId);
  }
  return false;
}

export function getEligibleBadgesForTask(
  state: AppState,
  taskId: string,
): Badge[] {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return [];

  return state.badges.filter((badge) => {
    if (state.unlockedBadgeIds.includes(badge.id)) return false;
    if (!badge.requirement) return false;
    return badgeAppliesToTask(badge, task);
  });
}

export async function processBadgeUnlockOnTaskComplete(
  userId: string,
  state: AppState,
  taskId: string,
): Promise<
  | { ok: true; newlyUnlocked: string[] }
  | { ok: false; error: string }
> {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: true, newlyUnlocked: [] };

  const eligible = getEligibleBadgesForTask(state, taskId).filter((badge) => {
    const req = badge.requirement!;
    return req.durationSeconds == null || req.durationSeconds <= 0;
  });

  const newlyUnlocked: string[] = [];

  for (const badge of eligible) {
    const req = badge.requirement!;
    let shouldUnlock = false;

    if (req.type === 'task') {
      shouldUnlock = true;
    } else if (req.type === 'category' && req.categoryId) {
      shouldUnlock = isCategoryFullyComplete(state, req.categoryId);
    }

    if (!shouldUnlock) continue;

    const unlock = await unlockBadgeForUser(userId, badge.id);
    if (!unlock.ok) return unlock;
    await markBadgeProgressComplete(userId, badge.id);
    newlyUnlocked.push(badge.id);
  }

  return { ok: true, newlyUnlocked };
}

export async function processBadgeUnlockOnTimeAccumulated(
  userId: string,
  state: AppState,
  taskId: string,
  seconds: number,
): Promise<
  | { ok: true; newlyUnlocked: string[] }
  | { ok: false; error: string }
> {
  if (seconds <= 0) return { ok: true, newlyUnlocked: [] };

  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: true, newlyUnlocked: [] };

  const eligible = getEligibleBadgesForTask(state, taskId).filter((badge) => {
    const req = badge.requirement!;
    return req.durationSeconds != null && req.durationSeconds > 0;
  });

  const newlyUnlocked: string[] = [];

  for (const badge of eligible) {
    const threshold = badge.requirement!.durationSeconds!;
    const progress = await incrementBadgeAccumulatedSeconds(
      userId,
      badge.id,
      seconds,
    );
    if (!progress.ok) return progress;

    if (progress.accumulatedSeconds < threshold) continue;

    const unlock = await unlockBadgeForUser(userId, badge.id);
    if (!unlock.ok) return unlock;
    await markBadgeProgressComplete(userId, badge.id);
    newlyUnlocked.push(badge.id);
  }

  return { ok: true, newlyUnlocked };
}
