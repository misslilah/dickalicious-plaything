-- Idempotent: per-puzzle best solve times (fastest wins).
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.puzzle_solve_times (
  puzzle_id uuid not null references public.puzzle_games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  best_time_ms integer not null check (best_time_ms > 0),
  updated_at timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);

do $$ begin
  alter table public.puzzle_solve_times
    add constraint puzzle_solve_times_user_id_profiles_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

create index if not exists puzzle_solve_times_leaderboard_idx
  on public.puzzle_solve_times (puzzle_id, best_time_ms asc, updated_at asc);

alter table public.puzzle_solve_times enable row level security;

drop policy if exists "puzzle_solve_times_select" on public.puzzle_solve_times;
create policy "puzzle_solve_times_select"
  on public.puzzle_solve_times for select to authenticated
  using (true);

drop policy if exists "puzzle_solve_times_insert_own" on public.puzzle_solve_times;
create policy "puzzle_solve_times_insert_own"
  on public.puzzle_solve_times for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "puzzle_solve_times_update_own" on public.puzzle_solve_times;
create policy "puzzle_solve_times_update_own"
  on public.puzzle_solve_times for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Leaderboard usernames: allow reading profiles for anyone on a puzzle scoreboard.
drop policy if exists "profiles_select_puzzle_leaderboard" on public.profiles;
create policy "profiles_select_puzzle_leaderboard"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.puzzle_solve_times p
      where p.user_id = profiles.id
    )
  );

create or replace function public.upsert_puzzle_best_time(
  p_puzzle_id uuid,
  p_best_time_ms integer
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
  if p_best_time_ms is null or p_best_time_ms <= 0 then
    raise exception 'best_time_ms must be positive';
  end if;

  insert into public.puzzle_solve_times (puzzle_id, user_id, best_time_ms, updated_at)
  values (p_puzzle_id, auth.uid(), p_best_time_ms, now())
  on conflict (puzzle_id, user_id)
  do update set
    best_time_ms = least(public.puzzle_solve_times.best_time_ms, excluded.best_time_ms),
    updated_at = case
      when excluded.best_time_ms < public.puzzle_solve_times.best_time_ms then now()
      else public.puzzle_solve_times.updated_at
    end;
end;
$$;

revoke all on function public.upsert_puzzle_best_time(uuid, integer) from public;
grant execute on function public.upsert_puzzle_best_time(uuid, integer) to authenticated;

create or replace function public.admin_reset_puzzle_leaderboard()
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

  delete from public.puzzle_solve_times;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.admin_reset_puzzle_leaderboard() from public;
grant execute on function public.admin_reset_puzzle_leaderboard() to authenticated;
