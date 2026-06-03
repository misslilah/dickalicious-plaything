import { getSupabase } from './supabase';

export async function tryRecordVideoCompletion(
  userId: string,
  videoId: string,
  xpReward: number,
): Promise<
  | { ok: true; awarded: true; xp: number }
  | { ok: true; awarded: false }
  | { ok: false; error: string }
> {
  if (xpReward <= 0) return { ok: true, awarded: false };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('user_video_completions')
    .insert({
      user_id: userId,
      video_id: videoId,
      xp_awarded: xpReward,
    })
    .select('xp_awarded')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { ok: true, awarded: false };
    }
    return { ok: false, error: error.message };
  }

  if (!data) return { ok: true, awarded: false };
  return { ok: true, awarded: true, xp: data.xp_awarded ?? xpReward };
}
