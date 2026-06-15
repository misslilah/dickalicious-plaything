import type { AppState, Session } from '../types';
import type { DailyTaskCompletionStatus } from './dailyTaskCompletions';
import { DAILY_TASK_COMPLETION_LIMIT } from './dailyTaskCompletions';

export const ADMIN_USER_PREVIEW_STORAGE_KEY = 'admin-user-preview-mode';

export const USER_PREVIEW_PROGRESS_BLOCKED =
  'Turn off user preview mode in Settings to save progress.';

const FRESH_PROGRESS: AppState['progress'] = {
  totalXp: 0,
  currentLevel: 1,
  streak: 0,
  lastActiveDate: null,
  points: 0,
  malusPoints: 0,
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

export function maskDailyTaskCompletionStatus(
  status: DailyTaskCompletionStatus | null,
): DailyTaskCompletionStatus | null {
  if (!status) return null;
  return {
    ok: true,
    used: 0,
    limit: status.limit ?? DAILY_TASK_COMPLETION_LIMIT,
    remaining: status.limit ?? DAILY_TASK_COMPLETION_LIMIT,
    unlimited: false,
    canComplete: true,
  };
}
