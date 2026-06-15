-- Recurring daily/weekly category tasks: acceptance and per-period completions.
-- Idempotent — safe to run multiple times in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Tasks: recurrence (category tasks only)
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists recurrence text not null default 'none';

alter table public.tasks
  drop constraint if exists tasks_recurrence_check;

alter table public.tasks
  add constraint tasks_recurrence_check
  check (recurrence in ('none', 'daily', 'weekly'));

create or replace function public.enforce_task_recurrence_category_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.recurrence, 'none') <> 'none'
    and coalesce(new.task_scope, 'category') <> 'category'
  then
    raise exception 'Recurrence applies only to category-scoped tasks';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_recurrence_category_scope on public.tasks;
create trigger tasks_recurrence_category_scope
  before insert or update of recurrence, task_scope
  on public.tasks
  for each row
  execute function public.enforce_task_recurrence_category_scope();

-- ---------------------------------------------------------------------------
-- User acceptance of recurring category tasks
-- ---------------------------------------------------------------------------

create table if not exists public.user_accepted_recurring_tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create index if not exists user_accepted_recurring_tasks_task_idx
  on public.user_accepted_recurring_tasks (task_id);

-- ---------------------------------------------------------------------------
-- Per-period completions for recurring category tasks
-- ---------------------------------------------------------------------------

create table if not exists public.user_recurring_task_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  period_key date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, task_id, period_key)
);

create index if not exists user_recurring_task_completions_task_idx
  on public.user_recurring_task_completions (task_id);

create index if not exists user_recurring_task_completions_period_idx
  on public.user_recurring_task_completions (user_id, period_key);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.user_accepted_recurring_tasks enable row level security;
alter table public.user_recurring_task_completions enable row level security;

drop policy if exists "user_accepted_recurring_tasks_select_own" on public.user_accepted_recurring_tasks;
create policy "user_accepted_recurring_tasks_select_own"
  on public.user_accepted_recurring_tasks for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_accepted_recurring_tasks_admin_all" on public.user_accepted_recurring_tasks;
create policy "user_accepted_recurring_tasks_admin_all"
  on public.user_accepted_recurring_tasks for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "user_recurring_task_completions_select_own" on public.user_recurring_task_completions;
create policy "user_recurring_task_completions_select_own"
  on public.user_recurring_task_completions for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_recurring_task_completions_admin_all" on public.user_recurring_task_completions;
create policy "user_recurring_task_completions_admin_all"
  on public.user_recurring_task_completions for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Period helpers (UTC calendar; matches daily_task_completions)
-- ---------------------------------------------------------------------------

create or replace function public.recurring_period_key(
  p_recurrence text,
  p_reference date default (now() at time zone 'utc')::date
)
returns date
language sql
immutable
as $$
  select case
    when p_recurrence = 'weekly' then date_trunc('week', p_reference::timestamp)::date
    else p_reference
  end;
$$;

-- ---------------------------------------------------------------------------
-- Accept a recurring category task
-- ---------------------------------------------------------------------------

create or replace function public.accept_recurring_category_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recurrence text;
  v_task_scope text;
  v_category_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select t.recurrence, t.task_scope, t.category_id
  into v_recurrence, v_task_scope, v_category_id
  from public.tasks t
  where t.id = p_task_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'task_not_found');
  end if;

  if coalesce(v_task_scope, 'category') <> 'category' then
    return jsonb_build_object('ok', false, 'error', 'not_category_task');
  end if;

  if coalesce(v_recurrence, 'none') not in ('daily', 'weekly') then
    return jsonb_build_object('ok', false, 'error', 'not_recurring_task');
  end if;

  if v_category_id is not null
    and not exists (
      select 1
      from public.category_members cm
      where cm.user_id = v_user_id
        and cm.category_id = v_category_id
    )
  then
    return jsonb_build_object('ok', false, 'error', 'not_category_member');
  end if;

  insert into public.user_accepted_recurring_tasks (user_id, task_id)
  values (v_user_id, p_task_id)
  on conflict (user_id, task_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.accept_recurring_category_task(uuid) from public;
grant execute on function public.accept_recurring_category_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Leave category: clear recurring acceptance + completions for that category
-- ---------------------------------------------------------------------------

create or replace function public.leave_category(p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.user_recurring_task_completions urtc
  where urtc.user_id = v_user_id
    and urtc.task_id in (
      select t.id
      from public.tasks t
      where t.category_id = p_category_id
    );

  delete from public.user_accepted_recurring_tasks uart
  where uart.user_id = v_user_id
    and uart.task_id in (
      select t.id
      from public.tasks t
      where t.category_id = p_category_id
    );

  delete from public.category_members cm
  where cm.user_id = v_user_id
    and cm.category_id = p_category_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Task completion: recurring gating + per-period tracking
-- ---------------------------------------------------------------------------

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
  v_task_scope text;
  v_category_id uuid;
  v_recurrence text;
  v_period_key date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select t.task_scope, t.category_id, coalesce(t.recurrence, 'none')
  into v_task_scope, v_category_id, v_recurrence
  from public.tasks t
  where t.id = p_task_id;

  if not found then
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

  if not v_is_admin
    and coalesce(v_task_scope, 'category') = 'category'
    and v_category_id is not null
    and not exists (
      select 1
      from public.category_members cm
      where cm.user_id = v_user_id
        and cm.category_id = v_category_id
    )
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_category_member'
    );
  end if;

  if not v_is_admin
    and v_recurrence in ('daily', 'weekly')
  then
    if not exists (
      select 1
      from public.user_accepted_recurring_tasks uart
      where uart.user_id = v_user_id
        and uart.task_id = p_task_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'recurring_not_accepted'
      );
    end if;

    v_period_key := public.recurring_period_key(v_recurrence, v_today);

    if exists (
      select 1
      from public.user_recurring_task_completions urtc
      where urtc.user_id = v_user_id
        and urtc.task_id = p_task_id
        and urtc.period_key = v_period_key
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'recurring_period_complete'
      );
    end if;
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

  if coalesce(v_task_scope, 'category') <> 'category' then
    v_status_json := public.build_daily_task_completion_status(v_used, v_limit);
    return v_status_json || jsonb_build_object('ok', true);
  end if;

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

  if v_recurrence in ('daily', 'weekly') then
    v_period_key := public.recurring_period_key(v_recurrence, v_today);
    insert into public.user_recurring_task_completions (
      user_id,
      task_id,
      period_key,
      completed_at
    )
    values (v_user_id, p_task_id, v_period_key, now())
    on conflict (user_id, task_id, period_key) do nothing;
  end if;

  v_status_json := public.build_daily_task_completion_status(v_used, v_limit);
  return v_status_json || jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_task_completion(uuid) from public;
grant execute on function public.record_task_completion(uuid) to authenticated;
