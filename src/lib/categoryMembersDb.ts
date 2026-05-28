import { getSupabase } from './supabase';

export async function fetchCategoryMemberIds(
  userId: string,
): Promise<{ ok: true; categoryIds: string[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('category_members')
    .select('category_id')
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    categoryIds: (data ?? []).map((r) => r.category_id as string),
  };
}

export async function joinCategoryDb(
  userId: string,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.from('category_members').upsert({
    user_id: userId,
    category_id: categoryId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
