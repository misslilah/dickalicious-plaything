-- Admin-only full site user progress reset (preserves accounts, catalog, Patreon, community chat).

create or replace function public.admin_reset_all_site_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_cleared jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Recurring category tasks
  delete from public.user_recurring_task_completions;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('recurring_task_completions', v_count);

  delete from public.user_accepted_recurring_tasks;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('accepted_recurring_tasks', v_count);

  -- Daily limits
  delete from public.daily_task_completions;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('daily_task_completions', v_count);

  delete from public.daily_game_attempts;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('daily_game_attempts', v_count);

  -- Punishments
  delete from public.punishment_completions;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('punishment_completions', v_count);

  -- Training
  delete from public.training_task_completions;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('training_task_completions', v_count);

  delete from public.training_tasks
  where assigned_user_id is not null;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('personal_training_tasks', v_count);

  -- Admin lock cards
  delete from public.user_lock_cards;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_lock_cards', v_count);

  -- Badges & rewards progress
  delete from public.user_badges;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_badges', v_count);

  delete from public.user_badge_progress;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_badge_progress', v_count);

  delete from public.user_bubble_pop_counts;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_bubble_pop_counts', v_count);

  -- Video shop & watch history
  delete from public.user_purchased_videos;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_purchased_videos', v_count);

  delete from public.user_video_completions;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_video_completions', v_count);

  delete from public.user_video_views;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_video_views', v_count);

  delete from public.video_playlists;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('video_playlists', v_count);

  -- Leaderboards & puzzles
  delete from public.puzzle_solve_times;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('puzzle_solve_times', v_count);

  delete from public.mini_game_scores;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('mini_game_scores', v_count);

  delete from public.mini_game_leaderboard_hall_of_fame;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('mini_game_leaderboard_hall_of_fame', v_count);

  -- Category membership & progression
  delete from public.category_members;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('category_members', v_count);

  -- Throne pending payments (gift event audit rows are kept; links cleared below)
  delete from public.throne_payment_pending;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('throne_payment_pending', v_count);

  update public.throne_gift_events
  set
    matched_user_id = null,
    matched_task_id = null,
    matched_pending_id = null
  where matched_user_id is not null
     or matched_task_id is not null
     or matched_pending_id is not null;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('throne_gift_events_unlinked', v_count);

  -- Core user progress (rows kept; values reset to defaults)
  update public.user_progress
  set
    total_xp = 0,
    current_level = 1,
    streak = 0,
    points = 0,
    malus_points = 0,
    last_active_date = null,
    settings = '{"dailyQuotaPercent":80,"resetHour":4}'::jsonb,
    daily_plans = '{}'::jsonb,
    unlocked_reward_ids = '[]'::jsonb,
    punishments = '[]'::jsonb,
    updated_at = now();
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('user_progress_reset', v_count);

  -- Training blackmail opt-in
  update public.profiles
  set
    training_blackmail_enabled = false,
    training_blackmail_consented_at = null
  where training_blackmail_enabled = true
     or training_blackmail_consented_at is not null;
  get diagnostics v_count = row_count;
  v_cleared := v_cleared || jsonb_build_object('blackmail_opt_in_cleared', v_count);

  return jsonb_build_object(
    'ok', true,
    'cleared', v_cleared
  );
end;
$$;

comment on function public.admin_reset_all_site_progress() is
  'Admin only. Clears all user progress/state (XP, tasks, leaderboards, purchases, etc.). '
  'Preserves auth accounts, profiles, Patreon links/tiers, catalog content, community chat, '
  'admin DMs, and throne gift event audit log (user links cleared).';

revoke all on function public.admin_reset_all_site_progress() from public;
grant execute on function public.admin_reset_all_site_progress() to authenticated;
