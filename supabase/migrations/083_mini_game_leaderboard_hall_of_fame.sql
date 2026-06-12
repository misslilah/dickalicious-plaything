-- Idempotent: preserve all-time best streak when admin resets mini-game leaderboards.
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.mini_game_leaderboard_hall_of_fame (
  game_type public.mini_game_type not null,
  game_id uuid not null,
  greatest_user_id uuid references auth.users (id) on delete set null,
  greatest_username text not null,
  greatest_best_streak integer not null check (greatest_best_streak > 0),
  archived_at timestamptz not null default now(),
  primary key (game_type, game_id)
);

alter table public.mini_game_leaderboard_hall_of_fame enable row level security;

drop policy if exists "mini_game_hall_of_fame_select" on public.mini_game_leaderboard_hall_of_fame;
create policy "mini_game_hall_of_fame_select"
  on public.mini_game_leaderboard_hall_of_fame for select to authenticated
  using (true);

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
  v_top_user_id uuid;
  v_top_username text;
  v_top_streak integer;
  v_existing_streak integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  if p_game_id is null then
    raise exception 'game_id is required';
  end if;

  select m.user_id, coalesce(nullif(trim(p.username), ''), 'Player'), m.best_streak
  into v_top_user_id, v_top_username, v_top_streak
  from public.mini_game_scores m
  left join public.profiles p on p.id = m.user_id
  where m.game_type = p_game_type
    and m.game_id = p_game_id
  order by m.best_streak desc, m.updated_at asc
  limit 1;

  select h.greatest_best_streak
  into v_existing_streak
  from public.mini_game_leaderboard_hall_of_fame h
  where h.game_type = p_game_type
    and h.game_id = p_game_id;

  if v_top_streak is not null
    and (v_existing_streak is null or v_top_streak > v_existing_streak) then
    insert into public.mini_game_leaderboard_hall_of_fame (
      game_type,
      game_id,
      greatest_user_id,
      greatest_username,
      greatest_best_streak,
      archived_at
    )
    values (
      p_game_type,
      p_game_id,
      v_top_user_id,
      v_top_username,
      v_top_streak,
      now()
    )
    on conflict (game_type, game_id) do update set
      greatest_user_id = excluded.greatest_user_id,
      greatest_username = excluded.greatest_username,
      greatest_best_streak = excluded.greatest_best_streak,
      archived_at = excluded.archived_at;
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
