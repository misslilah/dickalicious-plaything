-- Idempotent: mini-game leaderboards ranked by best streak.
-- Safe to run multiple times in Supabase SQL Editor.

do $$ begin
  create type public.mini_game_type as enum ('flash_cards', 'follow_instinct');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.mini_game_scores (
  game_type public.mini_game_type not null,
  game_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  best_streak integer not null default 0 check (best_streak >= 0),
  updated_at timestamptz not null default now(),
  primary key (game_type, game_id, user_id)
);

do $$ begin
  alter table public.mini_game_scores
    add constraint mini_game_scores_user_id_profiles_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

create index if not exists mini_game_scores_leaderboard_idx
  on public.mini_game_scores (game_type, game_id, best_streak desc, updated_at desc);

alter table public.mini_game_scores enable row level security;

drop policy if exists "mini_game_scores_select" on public.mini_game_scores;
create policy "mini_game_scores_select"
  on public.mini_game_scores for select to authenticated
  using (true);

drop policy if exists "mini_game_scores_insert_own" on public.mini_game_scores;
create policy "mini_game_scores_insert_own"
  on public.mini_game_scores for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "mini_game_scores_update_own" on public.mini_game_scores;
create policy "mini_game_scores_update_own"
  on public.mini_game_scores for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Leaderboard usernames: allow reading profiles for anyone on a mini-game scoreboard.
drop policy if exists "profiles_select_mini_game_leaderboard" on public.profiles;
create policy "profiles_select_mini_game_leaderboard"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.mini_game_scores m
      where m.user_id = profiles.id
    )
  );

create or replace function public.upsert_mini_game_best_streak(
  p_game_type public.mini_game_type,
  p_game_id uuid,
  p_best_streak integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_best_streak is null or p_best_streak < 0 then
    raise exception 'best_streak must be non-negative';
  end if;

  insert into public.mini_game_scores (game_type, game_id, user_id, best_streak, updated_at)
  values (p_game_type, p_game_id, auth.uid(), p_best_streak, now())
  on conflict (game_type, game_id, user_id)
  do update set
    best_streak = greatest(public.mini_game_scores.best_streak, excluded.best_streak),
    updated_at = case
      when excluded.best_streak > public.mini_game_scores.best_streak then now()
      else public.mini_game_scores.updated_at
    end;
end;
$$;

revoke all on function public.upsert_mini_game_best_streak(public.mini_game_type, uuid, integer)
  from public;
grant execute on function public.upsert_mini_game_best_streak(public.mini_game_type, uuid, integer)
  to authenticated;
