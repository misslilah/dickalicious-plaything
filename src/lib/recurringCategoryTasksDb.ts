import type { RecurringTaskCompletion } from '../types';
import { getSupabase } from './supabase';

const MIGRATION_HINT =
  'Recurring category tasks are not set up yet. In Supabase SQL Editor, run supabase/migrations/088_recurring_category_tasks.sql, then retry.';

type AcceptedRow = { task_id: string; accepted_at: string };
type CompletionRow = {
  task_id: string;
  period_key: string;
  completed_at: string;
};

type RpcResult = {
  ok?: boolean;
  error?: string;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    message.includes('user_accepted_recurring_tasks') ||
    message.includes('user_recurring_task_completions') ||
    message.includes('accept_recurring_category_task')
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

function formatAcceptError(error: string | undefined): string {
  switch (error) {
    case 'task_not_found':
      return 'Task not found.';
    case 'not_category_task':
      return 'Only category tasks can be accepted as recurring.';
    case 'not_recurring_task':
      return 'This task is not a recurring category task.';
    case 'not_category_member':
      return 'Join this category to accept its tasks.';
    default:
      return error ?? 'Could not accept task.';
  }
}

function formatCompletionError(error: string | undefined): string {
  switch (error) {
    case 'recurring_not_accepted':
      return 'Accept this recurring task before completing it.';
    case 'recurring_period_complete':
      return 'Already completed for this period.';
    default:
      return error ?? 'Could not complete task.';
  }
}

export async function fetchRecurringCategoryTaskData(
  userId: string,
): Promise<
  | {
      ok: true;
      acceptedTaskIds: string[];
      completions: RecurringTaskCompletion[];
    }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const [acceptedResult, completionsResult] = await Promise.all([
    supabase
      .from('user_accepted_recurring_tasks')
      .select('task_id, accepted_at')
      .eq('user_id', userId),
    supabase
      .from('user_recurring_task_completions')
      .select('task_id, period_key, completed_at')
      .eq('user_id', userId),
  ]);

  if (acceptedResult.error) {
    return { ok: false, error: formatDbError(acceptedResult.error) };
  }
  if (completionsResult.error) {
    return { ok: false, error: formatDbError(completionsResult.error) };
  }

  const acceptedRows = (acceptedResult.data ?? []) as AcceptedRow[];
  const completionRows = (completionsResult.data ?? []) as CompletionRow[];

  return {
    ok: true,
    acceptedTaskIds: acceptedRows.map((row) => row.task_id),
    completions: completionRows.map((row) => ({
      taskId: row.task_id,
      periodKey: row.period_key,
      completedAt: row.completed_at,
    })),
  };
}

export async function acceptRecurringCategoryTaskDb(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('accept_recurring_category_task', {
    p_task_id: taskId,
  });

  if (error) return { ok: false, error: formatDbError(error) };

  const row = data as RpcResult | null;
  if (row?.ok === false) {
    return { ok: false, error: formatAcceptError(row.error) };
  }

  return { ok: true };
}

export function mapRecurringCompletionRpcError(error: string | undefined): string {
  return formatCompletionError(error);
}
