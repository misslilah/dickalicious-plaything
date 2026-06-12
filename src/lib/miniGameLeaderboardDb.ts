import { getSupabase } from './supabase';

export type MiniGameType = 'flash_cards' | 'follow_instinct';

const MIGRATION_HINT =
  'Mini-game leaderboards are not set up yet. In Supabase SQL Editor, run supabase/migrations/046_mini_game_leaderboard.sql, then retry.';

const LEADERBOARD_LIMIT = 20;

export interface MiniGameLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  bestStreak: number;
}

export interface MiniGameLeaderboardResult {
  entries: MiniGameLeaderboardEntry[];
  userRank: { rank: number; bestStreak: number } | null;
}

export interface MiniGameGreatestEver {
  username: string;
  bestStreak: number;
}

export interface MiniGameCurrentBest {
  username: string;
  bestStreak: number;
}

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.mini_game_scores'") ||
    message.includes('mini_game_type')
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

export async function upsertMiniGameBestStreak(
  gameType: MiniGameType,
  gameId: string,
  bestStreak: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (bestStreak <= 0) return { ok: true };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to save your score.' };

  const { error } = await supabase.rpc('upsert_mini_game_best_streak', {
    p_game_type: gameType,
    p_game_id: gameId,
    p_best_streak: bestStreak,
  });

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true };
}

export async function fetchMiniGameUserBestStreak(
  gameType: MiniGameType,
  gameId: string,
): Promise<{ ok: true; bestStreak: number } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true, bestStreak: 0 };

  const { data, error } = await supabase
    .from('mini_game_scores')
    .select('best_streak')
    .eq('game_type', gameType)
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, bestStreak: data?.best_streak ?? 0 };
}

type DbLeaderboardRow = {
  best_streak: number;
  user_id: string;
  profiles: { username: string } | { username: string }[] | null;
};

function usernameFromRow(row: DbLeaderboardRow): string {
  const profile = row.profiles;
  if (!profile) return 'Player';
  if (Array.isArray(profile)) return profile[0]?.username?.trim() || 'Player';
  return profile.username?.trim() || 'Player';
}

export async function fetchMiniGameLeaderboard(
  gameType: MiniGameType,
  gameId: string,
  currentUserId: string | null,
): Promise<
  { ok: true; leaderboard: MiniGameLeaderboardResult } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('mini_game_scores')
    .select('best_streak, user_id, profiles(username)')
    .eq('game_type', gameType)
    .eq('game_id', gameId)
    .order('best_streak', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(LEADERBOARD_LIMIT);

  if (error) return { ok: false, error: formatDbError(error) };

  const entries: MiniGameLeaderboardEntry[] = (data as DbLeaderboardRow[] | null ?? []).map(
    (row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      username: usernameFromRow(row),
      bestStreak: row.best_streak,
    }),
  );

  let userRank: { rank: number; bestStreak: number } | null = null;

  if (currentUserId) {
    const inTop = entries.find((entry) => entry.userId === currentUserId);
    if (inTop) {
      userRank = { rank: inTop.rank, bestStreak: inTop.bestStreak };
    } else {
      const { data: myRow, error: myError } = await supabase
        .from('mini_game_scores')
        .select('best_streak')
        .eq('game_type', gameType)
        .eq('game_id', gameId)
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (!myError && myRow && myRow.best_streak > 0) {
        const { count, error: countError } = await supabase
          .from('mini_game_scores')
          .select('*', { count: 'exact', head: true })
          .eq('game_type', gameType)
          .eq('game_id', gameId)
          .gt('best_streak', myRow.best_streak);

        if (!countError) {
          userRank = {
            rank: (count ?? 0) + 1,
            bestStreak: myRow.best_streak as number,
          };
        }
      }
    }
  }

  return { ok: true, leaderboard: { entries, userRank } };
}

export async function fetchMiniGameGreatestEver(
  gameType: MiniGameType,
  gameId: string,
): Promise<{ ok: true; greatest: MiniGameGreatestEver | null } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('mini_game_leaderboard_hall_of_fame')
    .select('greatest_username, greatest_best_streak')
    .eq('game_type', gameType)
    .eq('game_id', gameId)
    .maybeSingle();

  if (error) {
    if (
      error.code === 'PGRST205' ||
      (error.message ?? '').includes("Could not find the table 'public.mini_game_leaderboard_hall_of_fame'")
    ) {
      return { ok: true, greatest: null };
    }
    return { ok: false, error: formatDbError(error) };
  }

  if (!data || data.greatest_best_streak <= 0) {
    return { ok: true, greatest: null };
  }

  return {
    ok: true,
    greatest: {
      username: data.greatest_username?.trim() || 'Player',
      bestStreak: data.greatest_best_streak,
    },
  };
}

export async function fetchMiniGameCurrentBest(
  gameType: MiniGameType,
  gameId: string,
): Promise<{ ok: true; currentBest: MiniGameCurrentBest | null } | { ok: false; error: string }> {
  const result = await fetchMiniGameLeaderboard(gameType, gameId, null);
  if (!result.ok) return result;

  const leader = result.leaderboard.entries[0];
  if (!leader || leader.bestStreak <= 0) {
    return { ok: true, currentBest: null };
  }

  return {
    ok: true,
    currentBest: {
      username: leader.username,
      bestStreak: leader.bestStreak,
    },
  };
}

export async function adminResetMiniGameLeaderboard(
  gameType: MiniGameType,
  gameId: string,
): Promise<{ ok: true; deletedCount: number } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('admin_reset_mini_game_leaderboard', {
    p_game_type: gameType,
    p_game_id: gameId,
  });

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, deletedCount: typeof data === 'number' ? data : 0 };
}
