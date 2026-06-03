import { getSupabase } from './supabase';

type DbBadgeProgress = {
  badge_id: string;
  accumulated_seconds: number;
  completed_task_ids: string[];
  completed: boolean;
};

export async function incrementBadgeAccumulatedSeconds(
  userId: string,
  badgeId: string,
  seconds: number,
): Promise<
  | { ok: true; accumulatedSeconds: number }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  if (seconds <= 0) return { ok: false, error: 'Seconds must be positive.' };

  const { data: existing, error: fetchError } = await supabase
    .from('user_badge_progress')
    .select('accumulated_seconds, completed')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (existing?.completed) {
    return { ok: true, accumulatedSeconds: existing.accumulated_seconds ?? 0 };
  }

  const nextSeconds = (existing?.accumulated_seconds ?? 0) + seconds;

  const { data, error } = await supabase
    .from('user_badge_progress')
    .upsert({
      user_id: userId,
      badge_id: badgeId,
      accumulated_seconds: nextSeconds,
      updated_at: new Date().toISOString(),
    })
    .select('accumulated_seconds')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to update badge progress.' };
  }

  return {
    ok: true,
    accumulatedSeconds: (data as DbBadgeProgress).accumulated_seconds,
  };
}

export async function markBadgeProgressComplete(
  userId: string,
  badgeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.from('user_badge_progress').upsert({
    user_id: userId,
    badge_id: badgeId,
    completed: true,
    updated_at: new Date().toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
