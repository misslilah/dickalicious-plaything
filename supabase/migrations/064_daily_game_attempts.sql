-- Idempotent: daily mini-game play attempt limits per Patreon tier.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- Limits (per game type per UTC day):
--   free / inactive Patreon: 0
--   sweetie: 3
--   princess: 15
--   slut: unlimited
--   admin: unlimited (bypass)

create table if not exists public.daily_game_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_type text not null check (game_type in ('flash_cards', 'follow_instinct', 'puzzle')),
  attempt_date date not null default ((now() at time zone 'utc')::date),
  count integer not null default 0 check (count >= 0),
  primary key (user_id, game_type, attempt_date)
);

do $$ begin
  alter table public.daily_game_attempts
    add constraint daily_game_attempts_user_id_profiles_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

create index if not exists daily_game_attempts_user_date_idx
  on public.daily_game_attempts (user_id, attempt_date desc);

alter table public.daily_game_attempts enable row level security;

drop policy if exists "daily_game_attempts_select_own" on public.daily_game_attempts;
create policy "daily_game_attempts_select_own"
  on public.daily_game_attempts for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "daily_game_attempts_insert_own" on public.daily_game_attempts;
create policy "daily_game_attempts_insert_own"
  on public.daily_game_attempts for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "daily_game_attempts_update_own" on public.daily_game_attempts;
create policy "daily_game_attempts_update_own"
  on public.daily_game_attempts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.mini_game_daily_limit_for_profile(
  p_patreon_tier text,
  p_patreon_status text,
  p_is_admin boolean
)
returns integer
language plpgsql
stable
set search_path = public
as $$
begin
  if p_is_admin then
    return -1;
  end if;
  if p_patreon_status is distinct from 'active' or p_patreon_tier is null then
    return 0;
  end if;
  case p_patreon_tier
    when 'sweetie' then return 3;
    when 'princess' then return 15;
    when 'slut' then return -1;
    else return 0;
  end case;
end;
$$;

create or replace function public.build_daily_game_attempt_status(
  p_used integer,
  p_limit integer
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_unlimited boolean := p_limit < 0;
  v_remaining integer;
begin
  if v_unlimited then
    return jsonb_build_object(
      'ok', true,
      'used', p_used,
      'limit', null,
      'remaining', null,
      'unlimited', true,
      'can_play', true
    );
  end if;

  v_remaining := greatest(p_limit - p_used, 0);

  return jsonb_build_object(
    'ok', true,
    'used', p_used,
    'limit', p_limit,
    'remaining', v_remaining,
    'unlimited', false,
    'can_play', p_used < p_limit
  );
end;
$$;

create or replace function public.get_daily_game_attempt_status(p_game_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
  v_status text;
  v_is_admin boolean;
  v_limit integer;
  v_used integer := 0;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_game_type not in ('flash_cards', 'follow_instinct', 'puzzle') then
    raise exception 'Invalid game_type';
  end if;

  select p.patreon_tier, p.patreon_status, (p.role = 'admin')
  into v_tier, v_status, v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_limit := public.mini_game_daily_limit_for_profile(v_tier, v_status, v_is_admin);

  select coalesce(d.count, 0)
  into v_used
  from public.daily_game_attempts d
  where d.user_id = v_user_id
    and d.game_type = p_game_type
    and d.attempt_date = v_today;

  if not found then
    v_used := 0;
  end if;

  return public.build_daily_game_attempt_status(v_used, v_limit);
end;
$$;

create or replace function public.start_mini_game_attempt(p_game_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
  v_status text;
  v_is_admin boolean;
  v_limit integer;
  v_used integer := 0;
  v_today date := (now() at time zone 'utc')::date;
  v_status_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_game_type not in ('flash_cards', 'follow_instinct', 'puzzle') then
    raise exception 'Invalid game_type';
  end if;

  select p.patreon_tier, p.patreon_status, (p.role = 'admin')
  into v_tier, v_status, v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_limit := public.mini_game_daily_limit_for_profile(v_tier, v_status, v_is_admin);

  if v_limit = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'patreon_required',
      'used', 0,
      'limit', 0,
      'remaining', 0,
      'unlimited', false,
      'can_play', false
    );
  end if;

  insert into public.daily_game_attempts (user_id, game_type, attempt_date, count)
  values (v_user_id, p_game_type, v_today, 0)
  on conflict (user_id, game_type, attempt_date) do nothing;

  select d.count
  into v_used
  from public.daily_game_attempts d
  where d.user_id = v_user_id
    and d.game_type = p_game_type
    and d.attempt_date = v_today
  for update;

  if v_limit >= 0 and v_used >= v_limit then
    return jsonb_build_object(
      'ok', false,
      'error', 'daily_limit_reached',
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'unlimited', false,
      'can_play', false
    );
  end if;

  update public.daily_game_attempts
  set count = count + 1
  where user_id = v_user_id
    and game_type = p_game_type
    and attempt_date = v_today
  returning count into v_used;

  v_status_json := public.build_daily_game_attempt_status(v_used, v_limit);
  return v_status_json || jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_daily_game_attempt_status(text) from public;
grant execute on function public.get_daily_game_attempt_status(text) to authenticated;

revoke all on function public.start_mini_game_attempt(text) from public;
grant execute on function public.start_mini_game_attempt(text) to authenticated;
