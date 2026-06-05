import { getSupabase } from './supabase';

export type VideoWatchLogType = 'partial' | 'full';

export type AdminVideoWatchLogRow = {
  logId: string;
  userId: string;
  username: string;
  email: string | null;
  videoId: string;
  videoTitle: string;
  categoryName: string | null;
  watchedAt: string;
  viewType: VideoWatchLogType;
  watchPercent: number | null;
  xpAwarded: number;
};

/** @deprecated Use AdminVideoWatchLogRow */
export type AdminVideoCompletionRow = AdminVideoWatchLogRow;

type DbAdminVideoWatchLogRow = {
  log_id: string;
  user_id: string;
  username: string;
  email: string | null;
  video_id: string;
  video_title: string;
  category_name: string | null;
  watched_at: string;
  view_type: VideoWatchLogType;
  watch_percent: number | null;
  xp_awarded: number;
};

export async function tryRecordVideoCompletion(
  userId: string,
  videoId: string,
  xpReward: number,
): Promise<
  | { ok: true; awarded: true; xp: number }
  | { ok: true; awarded: false }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('user_video_completions')
    .insert({
      user_id: userId,
      video_id: videoId,
      xp_awarded: Math.max(0, xpReward),
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
  return { ok: true, awarded: true, xp: data.xp_awarded ?? Math.max(0, xpReward) };
}

export async function tryRecordVideoPartialView(
  videoId: string,
  watchPercent: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.rpc('record_video_partial_view', {
    p_video_id: videoId,
    p_watch_percent: watchPercent,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

function mapWatchLogRow(row: DbAdminVideoWatchLogRow): AdminVideoWatchLogRow {
  return {
    logId: row.log_id,
    userId: row.user_id,
    username: row.username,
    email: row.email,
    videoId: row.video_id,
    videoTitle: row.video_title,
    categoryName: row.category_name,
    watchedAt: row.watched_at,
    viewType: row.view_type,
    watchPercent: row.watch_percent,
    xpAwarded: row.xp_awarded ?? 0,
  };
}

export async function fetchAdminVideoWatchLog(
  limit = 150,
): Promise<
  | { ok: true; rows: AdminVideoWatchLogRow[] }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('admin_list_video_watch_log', {
    p_limit: limit,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = ((data ?? []) as DbAdminVideoWatchLogRow[]).map(mapWatchLogRow);
  return { ok: true, rows };
}

/** @deprecated Use fetchAdminVideoWatchLog */
export async function fetchAdminVideoCompletions(
  limit = 100,
): Promise<
  | { ok: true; rows: AdminVideoWatchLogRow[] }
  | { ok: false; error: string }
> {
  return fetchAdminVideoWatchLog(limit);
}
