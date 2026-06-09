import { getSupabase } from './supabase';

export async function fetchPurchasedVideoIds(
  userId: string,
): Promise<{ ok: true; videoIds: string[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('user_purchased_videos')
    .select('video_id')
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };

  const videoIds = (data ?? []).map((row) => (row as { video_id: string }).video_id);
  return { ok: true, videoIds };
}

export async function purchaseVideoDb(
  videoId: string,
): Promise<
  | { ok: true; pointsRemaining: number }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('purchase_video', {
    p_video_id: videoId,
  });

  if (error) return { ok: false, error: error.message };

  const payload = data as {
    ok?: boolean;
    error?: string;
    points_remaining?: number;
  } | null;

  if (!payload?.ok) {
    return { ok: false, error: payload?.error ?? 'Purchase failed.' };
  }

  const pointsRemaining = payload.points_remaining;
  if (typeof pointsRemaining !== 'number') {
    return { ok: false, error: 'Purchase succeeded but balance was not returned.' };
  }

  return { ok: true, pointsRemaining };
}

export async function purchaseTierShopVideoDb(
  videoId: string,
): Promise<
  | { ok: true; pointsRemaining: number; videoId: string; videoTitle: string }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('purchase_video_with_points', {
    p_video_id: videoId,
  });

  if (error) return { ok: false, error: error.message };

  const payload = data as {
    ok?: boolean;
    error?: string;
    points_remaining?: number;
    video_id?: string;
    video_title?: string;
  } | null;

  if (!payload?.ok) {
    return { ok: false, error: payload?.error ?? 'Purchase failed.' };
  }

  const pointsRemaining = payload.points_remaining;
  const videoId = payload.video_id;
  const videoTitle = payload.video_title;

  if (typeof pointsRemaining !== 'number') {
    return { ok: false, error: 'Purchase succeeded but balance was not returned.' };
  }
  if (typeof videoId !== 'string' || typeof videoTitle !== 'string') {
    return { ok: false, error: 'Purchase succeeded but video details were not returned.' };
  }

  return { ok: true, pointsRemaining, videoId, videoTitle };
}
