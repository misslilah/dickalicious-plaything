import type { AppState, Session } from '../types';
import type { DailyTaskCompletionStatus } from './dailyTaskCompletions';
import { DAILY_TASK_COMPLETION_LIMIT } from './dailyTaskCompletions';
import {
  getCategoryCompletionStats,
  isCategoryFullyComplete,
} from './categoryProgression';

export const ADMIN_USER_PREVIEW_STORAGE_KEY = 'admin-user-preview-mode';

/** @deprecated Preview mutations are sandboxed locally; kept for any leftover callers. */
export const USER_PREVIEW_PROGRESS_BLOCKED =
  'Turn off user preview mode in Settings to save progress.';

export const USER_PREVIEW_SANDBOX_BANNER =
  'User preview sandbox — nothing you do here is saved.';

const FRESH_PROGRESS: AppState['progress'] = {
  totalXp: 0,
  currentLevel: 1,
  streak: 0,
  lastActiveDate: null,
  points: 0,
  malusPoints: 0,
};

/** Local-only progress while an admin is previewing as a fresh user. */
export type UserPreviewOverlay = {
  progress: AppState['progress'];
  joinedCategoryIds: string[];
  categoryMemberProgress: AppState['categoryMemberProgress'];
  acceptedRecurringTaskIds: string[];
  recurringTaskCompletions: AppState['recurringTaskCompletions'];
  unlockedBadgeIds: string[];
  unlockedRewardIds: string[];
  purchasedVideoIds: string[];
  punishments: AppState['punishments'];
  dailyPlans: AppState['dailyPlans'];
  dailyCompletionsUsed: number;
};

export function readAdminUserPreviewFromStorage(): boolean {
  try {
    return localStorage.getItem(ADMIN_USER_PREVIEW_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeAdminUserPreviewToStorage(enabled: boolean): void {
  try {
    localStorage.setItem(ADMIN_USER_PREVIEW_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore quota / private mode
  }
}

export function isEffectiveAdmin(
  session: Pick<Session, 'role'> | null | undefined,
  adminUserPreview: boolean,
): boolean {
  return session?.role === 'admin' && !adminUserPreview;
}

export function shouldApplyUserPreview(
  session: Pick<Session, 'role'> | null | undefined,
  adminUserPreview: boolean,
): boolean {
  return session?.role === 'admin' && adminUserPreview;
}

export function maskSessionForUserPreview(session: Session): Session {
  return {
    ...session,
    patreonTier: null,
    patreonStatus: 'none',
  };
}

export function maskStateForUserPreview(state: AppState): AppState {
  const maskedDailyPlans = Object.fromEntries(
    Object.entries(state.dailyPlans).map(([date, plan]) => [
      date,
      {
        ...plan,
        tasks: plan.tasks.map((entry) => ({
          ...entry,
          completed: false,
          completedAt: undefined,
        })),
        closedAt: undefined,
      },
    ]),
  );

  return {
    ...state,
    progress: { ...FRESH_PROGRESS },
    joinedCategoryIds: [],
    categoryMemberProgress: [],
    acceptedRecurringTaskIds: [],
    recurringTaskCompletions: [],
    unlockedBadgeIds: [],
    unlockedRewardIds: [],
    purchasedVideoIds: [],
    punishments: [],
    dailyPlans: maskedDailyPlans,
  };
}

export function extractUserPreviewOverlay(
  state: AppState,
  dailyCompletionsUsed = 0,
): UserPreviewOverlay {
  return {
    progress: { ...state.progress },
    joinedCategoryIds: [...state.joinedCategoryIds],
    categoryMemberProgress: state.categoryMemberProgress.map((row) => ({ ...row })),
    acceptedRecurringTaskIds: [...(state.acceptedRecurringTaskIds ?? [])],
    recurringTaskCompletions: (state.recurringTaskCompletions ?? []).map((row) => ({
      ...row,
    })),
    unlockedBadgeIds: [...state.unlockedBadgeIds],
    unlockedRewardIds: [...state.unlockedRewardIds],
    purchasedVideoIds: [...state.purchasedVideoIds],
    punishments: state.punishments.map((row) => ({ ...row })),
    dailyPlans: Object.fromEntries(
      Object.entries(state.dailyPlans).map(([date, plan]) => [
        date,
        {
          ...plan,
          tasks: plan.tasks.map((entry) => ({ ...entry })),
          extraTaskIds: [...(plan.extraTaskIds ?? [])],
          startedTaskIds: [...(plan.startedTaskIds ?? [])],
        },
      ]),
    ),
    dailyCompletionsUsed,
  };
}

export function applyUserPreviewOverlay(
  state: AppState,
  overlay: UserPreviewOverlay,
): AppState {
  return {
    ...state,
    progress: overlay.progress,
    joinedCategoryIds: overlay.joinedCategoryIds,
    categoryMemberProgress: overlay.categoryMemberProgress,
    acceptedRecurringTaskIds: overlay.acceptedRecurringTaskIds,
    recurringTaskCompletions: overlay.recurringTaskCompletions,
    unlockedBadgeIds: overlay.unlockedBadgeIds,
    purchasedVideoIds: overlay.purchasedVideoIds,
    unlockedRewardIds: overlay.unlockedRewardIds,
    punishments: overlay.punishments,
    dailyPlans: overlay.dailyPlans,
  };
}

/** Catalog from real state; memberships/progress from the sandbox overlay (or empty). */
export function composeUserPreviewState(
  realState: AppState,
  overlay: UserPreviewOverlay | null,
): AppState {
  const masked = maskStateForUserPreview(realState);
  if (!overlay) {
    return { ...masked, dailyPlans: {} };
  }
  return applyUserPreviewOverlay(masked, overlay);
}

export function sandboxDailyTaskCompletionStatus(
  used: number,
  limit: number = DAILY_TASK_COMPLETION_LIMIT,
): DailyTaskCompletionStatus {
  return {
    ok: true,
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    unlimited: false,
    canComplete: used < limit,
  };
}

export function maskDailyTaskCompletionStatus(
  status: DailyTaskCompletionStatus | null,
): DailyTaskCompletionStatus | null {
  if (!status) return sandboxDailyTaskCompletionStatus(0);
  return sandboxDailyTaskCompletionStatus(0, status.limit ?? DAILY_TASK_COMPLETION_LIMIT);
}

export function withSyncedCategoryProgress(
  state: AppState,
  categoryId: string | null | undefined,
): AppState {
  if (!categoryId || !state.joinedCategoryIds.includes(categoryId)) {
    return state;
  }
  const { completed } = getCategoryCompletionStats(state, categoryId);
  return {
    ...state,
    categoryMemberProgress: [
      ...state.categoryMemberProgress.filter((row) => row.categoryId !== categoryId),
      {
        categoryId,
        tasksCompletedCount: completed,
        markedCompleteAt: isCategoryFullyComplete(state, categoryId)
          ? new Date().toISOString()
          : null,
      },
    ],
  };
}
