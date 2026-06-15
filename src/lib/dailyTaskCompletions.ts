import { MALUS_TASK_BLOCK_MESSAGE } from './malus';
import { mapRecurringCompletionRpcError } from './recurringCategoryTasksDb';
import { getSupabase } from './supabase';

const MIGRATION_HINT =
  'Category membership and task limits are not set up yet. In Supabase SQL Editor, run supabase/migrations/069_daily_task_completions.sql, 070_refine_daily_task_limit_category_only.sql, and 086_category_membership_exam_prerequisites.sql, then retry.';

export const DAILY_TASK_COMPLETION_LIMIT = 3;

export interface DailyTaskCompletionStatus {
  ok: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  canComplete: boolean;
  error?: 'daily_limit_reached' | 'task_not_found' | 'not_category_member' | 'recurring_not_accepted' | 'recurring_period_complete' | 'active_malus';
}

type RpcStatusRow = {
  ok?: boolean;
  used?: number;
  limit?: number | null;
  remaining?: number | null;
  unlimited?: boolean;
  can_complete?: boolean;
  error?: string;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    message.includes('daily_task_completions') ||
    message.includes('record_task_completion') ||
    message.includes('get_daily_task_completion_status')
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

export function mapDailyTaskCompletionStatus(
  row: RpcStatusRow | null,
): DailyTaskCompletionStatus {
  const used = typeof row?.used === 'number' ? row.used : 0;
  const unlimited = row?.unlimited === true;
  const limit = unlimited ? null : (typeof row?.limit === 'number' ? row.limit : DAILY_TASK_COMPLETION_LIMIT);
  const remaining = unlimited
    ? null
    : typeof row?.remaining === 'number'
      ? row.remaining
      : Math.max((limit ?? 0) - used, 0);
  const canComplete =
    row?.can_complete ?? (unlimited || used < (limit ?? DAILY_TASK_COMPLETION_LIMIT));
  const error =
    row?.error === 'daily_limit_reached' ||
    row?.error === 'task_not_found' ||
    row?.error === 'not_category_member' ||
    row?.error === 'recurring_not_accepted' ||
    row?.error === 'recurring_period_complete' ||
    row?.error === 'active_malus'
      ? row.error
      : undefined;

  return {
    ok: row?.ok !== false,
    used,
    limit,
    remaining,
    unlimited,
    canComplete,
    error,
  };
}

export function dailyTaskCompletionRemainingLabel(
  status: DailyTaskCompletionStatus,
): string | null {
  if (status.unlimited) return null;
  if (status.limit == null || status.limit <= 0) return null;
  const limit = status.limit;
  const remaining =
    status.remaining ?? Math.max(limit - status.used, 0);
  if (remaining === 1) return `1 of ${limit} category task left today`;
  return `${remaining} of ${limit} category tasks left today`;
}

export function dailyTaskCompletionBlockedMessage(
  status: DailyTaskCompletionStatus,
): string {
  if (!status.canComplete && status.limit != null && status.limit > 0) {
    const used = status.used;
    const limit = status.limit;
    return `Category task limit reached (${used}/${limit}). Come back tomorrow.`;
  }
  return 'You cannot complete more category tasks right now.';
}

export async function fetchDailyTaskCompletionStatus(): Promise<
  { ok: true; status: DailyTaskCompletionStatus } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('get_daily_task_completion_status');

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, status: mapDailyTaskCompletionStatus(data as RpcStatusRow | null) };
}

export async function recordTaskCompletionDb(
  taskId: string,
): Promise<
  | { ok: true; status: DailyTaskCompletionStatus }
  | { ok: false; error: string; status?: DailyTaskCompletionStatus }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('record_task_completion', {
    p_task_id: taskId,
  });

  if (error) return { ok: false, error: formatDbError(error) };

  const row = data as RpcStatusRow | null;
  const status = mapDailyTaskCompletionStatus(row);
  if (
    row?.ok === false ||
    status.error === 'daily_limit_reached' ||
    status.error === 'active_malus'
  ) {
    return {
      ok: false,
      error:
        status.error === 'active_malus'
          ? MALUS_TASK_BLOCK_MESSAGE
          : status.error === 'not_category_member'
          ? 'Join this category to complete its tasks.'
          : status.error === 'recurring_not_accepted' ||
              status.error === 'recurring_period_complete'
            ? mapRecurringCompletionRpcError(status.error)
            : dailyTaskCompletionBlockedMessage(status),
      status,
    };
  }

  return { ok: true, status };
}
