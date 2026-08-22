import { getSupabase } from './supabase';

export type AdminSiteResetSummary = Record<string, number>;

export type AdminSiteResetResult =
  | { ok: true; cleared: AdminSiteResetSummary }
  | { ok: false; error: string };

const MIGRATION_HINT =
  'Full site reset requires supabase/migrations/094_admin_reset_all_site_progress.sql. Run it in the Supabase SQL Editor, then retry.';

function parseCleared(data: unknown): AdminSiteResetSummary {
  if (!data || typeof data !== 'object') return {};
  const root = data as { cleared?: unknown };
  if (!root.cleared || typeof root.cleared !== 'object' || root.cleared === null) {
    return {};
  }
  const cleared: AdminSiteResetSummary = {};
  for (const [key, value] of Object.entries(root.cleared as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      cleared[key] = value;
    }
  }
  return cleared;
}

export async function adminResetAllSiteProgress(): Promise<AdminSiteResetResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('admin_reset_all_site_progress');

  if (error) {
    const missingRpc =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /admin_reset_all_site_progress/i.test(error.message ?? '') ||
      /function.*does not exist/i.test(error.message ?? '');
    if (missingRpc) {
      return { ok: false, error: MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  const payload = data as { ok?: boolean } | null;
  if (payload?.ok === false) {
    return { ok: false, error: 'Site reset was rejected by the server.' };
  }

  return { ok: true, cleared: parseCleared(data) };
}

/** Human-readable labels for reset summary keys (English UI). */
export const ADMIN_SITE_RESET_AREA_LABELS: Record<string, string> = {
  user_progress_reset: 'User progress rows reset',
  category_members: 'Category memberships',
  daily_task_completions: 'Daily task completion counts',
  daily_game_attempts: 'Daily mini-game attempts',
  accepted_recurring_tasks: 'Accepted recurring tasks',
  recurring_task_completions: 'Recurring task completions',
  punishment_completions: 'Punishment completion history',
  training_task_completions: 'Training task completions',
  personal_training_tasks: 'Personal training tasks',
  blackmail_opt_in_cleared: 'Blackmail opt-in cleared',
  user_lock_cards: 'Active lock cards',
  user_badges: 'Unlocked badges',
  user_badge_progress: 'Badge progress',
  user_bubble_pop_counts: 'Bubble pop counts',
  user_purchased_videos: 'Purchased videos',
  user_video_completions: 'Video completions',
  user_video_views: 'Video watch history',
  video_playlists: 'User video playlists',
  mini_game_scores: 'Mini-game leaderboard scores',
  mini_game_leaderboard_hall_of_fame: 'Mini-game hall of fame',
  puzzle_solve_times: 'Puzzle solve times',
  throne_payment_pending: 'Pending Throne payments',
  throne_gift_events_unlinked: 'Throne gift event user links cleared',
};

export const ADMIN_SITE_RESET_PRESERVED = [
  'User accounts and profiles (usernames, roles)',
  'Patreon links, tiers, and sync status',
  'Catalog content (categories, tasks, rewards, badges, games, videos, training task definitions)',
  'Community chat messages and reactions',
  'Admin direct messages',
  'Throne gift event audit log (rows kept; user links cleared)',
  'Site-wide admin settings (GIF bank timing, etc.)',
] as const;

export const ADMIN_SITE_RESET_CLEARED = [
  'XP, level, streak, points, and malus',
  'Daily plans and unlocked shop rewards',
  'Assigned punishments and punishment history',
  'Category memberships and task progression',
  'Recurring task accept/completion state',
  'Daily task and mini-game attempt limits',
  'Mini-game leaderboards and hall of fame',
  'Puzzle solve times',
  'Unlocked badges and badge progress',
  'Purchased videos, watch history, and user playlists',
  'Training completions, personal training tasks, and blackmail opt-in',
  'Active admin lock cards and pending Throne payments',
] as const;

export function formatAdminSiteResetSummary(cleared: AdminSiteResetSummary): string {
  const userCount = cleared.user_progress_reset ?? 0;
  const lines = Object.entries(cleared)
    .filter(([key, count]) => key !== 'user_progress_reset' && count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const label = ADMIN_SITE_RESET_AREA_LABELS[key] ?? key;
      return `${label}: ${count}`;
    });

  const headline =
    userCount > 0
      ? `Reset progress for ${userCount} user${userCount === 1 ? '' : 's'}.`
      : 'Site reset complete. No user progress rows were found.';

  if (lines.length === 0) {
    return headline;
  }

  return `${headline}\n${lines.join('\n')}`;
}
