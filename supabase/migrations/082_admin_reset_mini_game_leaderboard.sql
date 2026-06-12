-- Idempotent: admin-only reset for mini-game streak leaderboards.
-- Safe to run multiple times in Supabase SQL Editor.

create or replace function public.admin_reset_mini_game_leaderboard(
  p_game_type public.mini_game_type,
  p_game_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  if p_game_id is null then
    raise exception 'game_id is required';
  end if;

  delete from public.mini_game_scores
  where game_type = p_game_type
    and game_id = p_game_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.admin_reset_mini_game_leaderboard(public.mini_game_type, uuid)
  from public;
grant execute on function public.admin_reset_mini_game_leaderboard(public.mini_game_type, uuid)
  to authenticated;
