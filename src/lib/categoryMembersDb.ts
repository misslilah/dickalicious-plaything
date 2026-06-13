import type { AppState, CategoryMemberProgress } from '../types';
import { getCategoryCompletionStats, isCategoryFullyComplete } from './categoryProgression';
import { getSupabase } from './supabase';

type DbMemberRow = {
  category_id: string;
  tasks_completed_count: number;
  marked_complete_at: string | null;
};

type RpcResult = {
  ok?: boolean;
  error?: string;
};

function mapMemberRow(row: DbMemberRow): CategoryMemberProgress {
  return {
    categoryId: row.category_id,
    tasksCompletedCount: row.tasks_completed_count ?? 0,
    markedCompleteAt: row.marked_complete_at,
  };
}

function formatRpcError(error: string | undefined): string {
  if (!error) return 'Request failed.';
  if (error.includes('3 categories')) {
    return 'You can only join up to 3 categories at once.';
  }
  return error;
}

export async function fetchCategoryMembers(
  userId: string,
): Promise<
  | { ok: true; categoryIds: string[]; progress: CategoryMemberProgress[] }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('category_members')
    .select('category_id, tasks_completed_count, marked_complete_at')
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as DbMemberRow[];
  return {
    ok: true,
    categoryIds: rows.map((r) => r.category_id),
    progress: rows.map(mapMemberRow),
  };
}

/** @deprecated Use fetchCategoryMembers */
export async function fetchCategoryMemberIds(
  userId: string,
): Promise<{ ok: true; categoryIds: string[] } | { ok: false; error: string }> {
  const result = await fetchCategoryMembers(userId);
  if (!result.ok) return result;
  return { ok: true, categoryIds: result.categoryIds };
}

export async function joinCategoryDb(
  userId: string,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('join_category', {
    p_category_id: categoryId,
  });

  if (error) {
    if (error.message.includes('join_category')) {
      const { error: fallbackError } = await supabase.from('category_members').upsert({
        user_id: userId,
        category_id: categoryId,
        tasks_completed_count: 0,
        marked_complete_at: null,
      });
      if (fallbackError) return { ok: false, error: formatRpcError(fallbackError.message) };
      return { ok: true };
    }
    return { ok: false, error: formatRpcError(error.message) };
  }

  const row = data as RpcResult | null;
  if (row?.ok === false) {
    return { ok: false, error: formatRpcError(row.error) };
  }

  return { ok: true };
}

export async function leaveCategoryDb(
  userId: string,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('leave_category', {
    p_category_id: categoryId,
  });

  if (error) {
    if (error.message.includes('leave_category')) {
      const { error: fallbackError } = await supabase
        .from('category_members')
        .delete()
        .eq('user_id', userId)
        .eq('category_id', categoryId);
      if (fallbackError) return { ok: false, error: fallbackError.message };
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }

  const row = data as RpcResult | null;
  if (row?.ok === false) {
    return { ok: false, error: row.error ?? 'Could not leave category.' };
  }

  return { ok: true };
}

export async function syncCategoryProgressDb(
  userId: string,
  categoryId: string,
  state: AppState,
): Promise<{ ok: true; progress: CategoryMemberProgress } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { completed } = getCategoryCompletionStats(state, categoryId);
  const markedCompleteAt = isCategoryFullyComplete(state, categoryId)
    ? new Date().toISOString()
    : null;

  const { data, error } = await supabase
    .from('category_members')
    .update({
      tasks_completed_count: completed,
      marked_complete_at: markedCompleteAt,
    })
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .select('category_id, tasks_completed_count, marked_complete_at')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Category membership not found.' };
  }

  return { ok: true, progress: mapMemberRow(data as DbMemberRow) };
}
