import { formatDuration } from './formatDuration';
import { getSupabase } from './supabase';

const MIGRATION_HINT =
  'Puzzle leaderboards are not set up yet. In Supabase SQL Editor, run supabase/migrations/081_puzzle_solve_times.sql, then retry.';

export interface PuzzleBestSolver {
  username: string;
  bestTimeMs: number;
}

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.puzzle_solve_times'") ||
    message.includes('upsert_puzzle_best_time')
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

function usernameFromProfile(
  profile: { username: string } | { username: string }[] | null,
): string {
  if (!profile) return 'Player';
  if (Array.isArray(profile)) return profile[0]?.username?.trim() || 'Player';
  return profile.username?.trim() || 'Player';
}

export function formatPuzzleSolveTime(timeMs: number): string {
  const seconds = Math.floor(timeMs / 1000);
  return formatDuration(seconds) || '0:00';
}

export async function upsertPuzzleBestTime(
  puzzleId: string,
  bestTimeMs: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (bestTimeMs <= 0) return { ok: true };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to save your score.' };

  const { error } = await supabase.rpc('upsert_puzzle_best_time', {
    p_puzzle_id: puzzleId,
    p_best_time_ms: Math.round(bestTimeMs),
  });

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true };
}

export async function fetchPuzzleBestSolver(
  puzzleId: string,
): Promise<
  { ok: true; bestSolver: PuzzleBestSolver | null } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('puzzle_solve_times')
    .select('best_time_ms, profiles(username)')
    .eq('puzzle_id', puzzleId)
    .order('best_time_ms', { ascending: true })
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: formatDbError(error) };
  if (!data) return { ok: true, bestSolver: null };

  const row = data as {
    best_time_ms: number;
    profiles: { username: string } | { username: string }[] | null;
  };

  return {
    ok: true,
    bestSolver: {
      username: usernameFromProfile(row.profiles),
      bestTimeMs: row.best_time_ms,
    },
  };
}

export async function adminResetPuzzleLeaderboard(): Promise<
  { ok: true; deletedCount: number } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('admin_reset_puzzle_leaderboard');

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, deletedCount: typeof data === 'number' ? data : 0 };
}
