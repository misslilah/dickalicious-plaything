import { getSupabase } from './supabase';

const BUBBLE_POP_MIGRATION_HINT =
  'Bubble pop tracking is not set up yet. In Supabase SQL Editor, run supabase/migrations/047_bubble_pop_badge_unlocks.sql.';

function formatBubblePopError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    message.includes('increment_user_bubble_pop_count') ||
    message.includes("Could not find the table 'public.user_bubble_pop_counts'")
  ) {
    return BUBBLE_POP_MIGRATION_HINT;
  }
  return message;
}

/** Increments the signed-in user's hidden soap bubble pop count; returns the new total. */
export async function incrementUserBubblePopCount(): Promise<
  { ok: true; popCount: number } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('increment_user_bubble_pop_count');
  if (error) return { ok: false, error: formatBubblePopError(error) };

  const popCount = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(popCount) || popCount < 0) {
    return { ok: false, error: 'Invalid pop count returned.' };
  }
  return { ok: true, popCount };
}
