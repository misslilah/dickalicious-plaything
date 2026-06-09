-- Idempotent: daily task completion limit (3 per UTC day for non-admin users).
-- Safe to run multiple times in Supabase SQL Editor.
--
-- Limits (per UTC day):
--   admin: unlimited (bypass)
--   all other users: 3 task completions

create table if not exists public.daily_task_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  completion_date date not null default ((now() at time zone 'utc')::date),
  count integer not null default 0 check (count >= 0),
  primary key (user_id, completion_date)
);

do $$ begin
  alter table public.daily_task_completions
    add constraint daily_task_completions_user_id_profiles_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

create index if not exists daily_task_completions_user_date_idx
  on public.daily_task_completions (user_id, completion_date desc);

alter table public.daily_task_completions enable row level security;

drop policy if exists "daily_task_completions_select_own" on public.daily_task_completions;
create policy "daily_task_completions_select_own"
  on public.daily_task_completions for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "daily_task_completions_insert_own" on public.daily_task_completions;
create policy "daily_task_completions_insert_own"
  on public.daily_task_completions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "daily_task_completions_update_own" on public.daily_task_completions;
create policy "daily_task_completions_update_own"
  on public.daily_task_completions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.daily_task_completion_limit(p_is_admin boolean)
returns integer
language plpgsql
stable
set search_path = public
as $$
begin
  if p_is_admin then
    return -1;
  end if;
  return 3;
end;
$$;

create or replace function public.build_daily_task_completion_status(
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
      'can_complete', true
    );
  end if;

  v_remaining := greatest(p_limit - p_used, 0);

  return jsonb_build_object(
    'ok', true,
    'used', p_used,
    'limit', p_limit,
    'remaining', v_remaining,
    'unlimited', false,
    'can_complete', p_used < p_limit
  );
end;
$$;

create or replace function public.get_daily_task_completion_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_limit integer;
  v_used integer := 0;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select (p.role = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_limit := public.daily_task_completion_limit(v_is_admin);

  select coalesce(d.count, 0)
  into v_used
  from public.daily_task_completions d
  where d.user_id = v_user_id
    and d.completion_date = v_today;

  if not found then
    v_used := 0;
  end if;

  return public.build_daily_task_completion_status(v_used, v_limit);
end;
$$;

create or replace function public.record_task_completion(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_limit integer;
  v_used integer := 0;
  v_today date := (now() at time zone 'utc')::date;
  v_status_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.tasks t where t.id = p_task_id) then
    return jsonb_build_object(
      'ok', false,
      'error', 'task_not_found'
    );
  end if;

  select (p.role = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_limit := public.daily_task_completion_limit(v_is_admin);

  insert into public.daily_task_completions (user_id, completion_date, count)
  values (v_user_id, v_today, 0)
  on conflict (user_id, completion_date) do nothing;

  select d.count
  into v_used
  from public.daily_task_completions d
  where d.user_id = v_user_id
    and d.completion_date = v_today
  for update;

  if v_limit >= 0 and v_used >= v_limit then
    return jsonb_build_object(
      'ok', false,
      'error', 'daily_limit_reached',
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'unlimited', false,
      'can_complete', false
    );
  end if;

  update public.daily_task_completions
  set count = count + 1
  where user_id = v_user_id
    and completion_date = v_today
  returning count into v_used;

  v_status_json := public.build_daily_task_completion_status(v_used, v_limit);
  return v_status_json || jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_daily_task_completion_status() from public;
grant execute on function public.get_daily_task_completion_status() to authenticated;

revoke all on function public.record_task_completion(uuid) from public;
grant execute on function public.record_task_completion(uuid) to authenticated;
