import type { AppState, DailyPlan, Punishment } from '../types';
import { createInitialState } from './seed';
import { getSupabase } from './supabase';

type DbUserProgress = {
  user_id: string;
  total_xp: number;
  current_level: number;
  streak: number;
  points: number;
  last_active_date: string | null;
  settings: AppState['settings'];
  daily_plans: Record<string, DailyPlan>;
  unlocked_reward_ids: string[];
  punishments: Punishment[];
};

export function userSliceFromState(state: AppState): Omit<AppState, 'categories' | 'tasks' | 'rewards' | 'punishmentTemplates' | 'videoCategories' | 'videos' | 'levels' | 'version'> {
  return {
    progress: state.progress,
    dailyPlans: state.dailyPlans,
    punishments: state.punishments,
    settings: state.settings,
    unlockedRewardIds: state.unlockedRewardIds,
  };
}

export function applyUserProgressToState(
  base: AppState,
  row: DbUserProgress,
): AppState {
  return {
    ...base,
    progress: {
      totalXp: row.total_xp,
      currentLevel: row.current_level,
      streak: row.streak,
      points: row.points,
      lastActiveDate: row.last_active_date,
    },
    dailyPlans: row.daily_plans ?? {},
    settings: row.settings ?? base.settings,
    unlockedRewardIds: row.unlocked_reward_ids ?? [],
    punishments: row.punishments ?? [],
  };
}

export async function fetchUserProgress(
  userId: string,
): Promise<{ ok: true; state: AppState } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const base = createInitialState();
  if (!data) {
    const { error: insertError } = await supabase.from('user_progress').insert({
      user_id: userId,
    });
    if (insertError) return { ok: false, error: insertError.message };
    return { ok: true, state: base };
  }

  return { ok: true, state: applyUserProgressToState(base, data as DbUserProgress) };
}

export async function saveUserProgress(
  userId: string,
  state: AppState,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    user_id: userId,
    total_xp: state.progress.totalXp,
    current_level: state.progress.currentLevel,
    streak: state.progress.streak,
    points: state.progress.points,
    last_active_date: state.progress.lastActiveDate,
    settings: state.settings,
    daily_plans: state.dailyPlans,
    unlocked_reward_ids: state.unlockedRewardIds,
    punishments: state.punishments,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('user_progress').upsert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
