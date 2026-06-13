-- Category membership limits, task prerequisites, exam mode, and completion gating.
-- Idempotent — safe to run multiple times in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Tasks: ordering, prerequisites, exam flag
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists sort_order int not null default 0;

alter table public.tasks
  add column if not exists prerequisite_task_id uuid
  references public.tasks (id) on delete set null;

alter table public.tasks
  add column if not exists is_exam_task boolean not null default false;

create index if not exists tasks_category_sort_idx
  on public.tasks (category_id, sort_order asc, created_at asc);

create index if not exists tasks_prerequisite_idx
  on public.tasks (prerequisite_task_id);

create or replace function public.enforce_task_prerequisite_same_category()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prereq_category uuid;
begin
  if new.prerequisite_task_id is null then
    return new;
  end if;

  select t.category_id
  into v_prereq_category
  from public.tasks t
  where t.id = new.prerequisite_task_id;

  if not found then
    raise exception 'Prerequisite task not found';
  end if;

  if new.category_id is distinct from v_prereq_category then
    raise exception 'Prerequisite task must belong to the same category';
  end if;

  if new.id is not null and new.prerequisite_task_id = new.id then
    raise exception 'A task cannot be its own prerequisite';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_prerequisite_same_category on public.tasks;
create trigger tasks_prerequisite_same_category
  before insert or update of prerequisite_task_id, category_id
  on public.tasks
  for each row
  execute function public.enforce_task_prerequisite_same_category();

-- ---------------------------------------------------------------------------
-- Category membership: max 3 active joins per user
-- ---------------------------------------------------------------------------

create or replace function public.enforce_max_category_memberships()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from public.category_members cm
  where cm.user_id = new.user_id;

  if v_count >= 3 then
    raise exception 'You can only join up to 3 categories at once';
  end if;

  return new;
end;
$$;

drop trigger if exists category_members_max_three on public.category_members;
create trigger category_members_max_three
  before insert
  on public.category_members
  for each row
  execute function public.enforce_max_category_memberships();

-- ---------------------------------------------------------------------------
-- Join / leave helpers
-- ---------------------------------------------------------------------------

create or replace function public.join_category(p_category_id uuid)
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

  if not exists (select 1 from public.categories c where c.id = p_category_id) then
    return jsonb_build_object('ok', false, 'error', 'category_not_found');
  end if;

  if exists (
    select 1
    from public.category_members cm
    where cm.user_id = v_user_id
      and cm.category_id = p_category_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_joined');
  end if;

  insert into public.category_members (user_id, category_id, tasks_completed_count, marked_complete_at)
  values (v_user_id, p_category_id, 0, null);

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

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

  delete from public.category_members cm
  where cm.user_id = v_user_id
    and cm.category_id = p_category_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.join_category(uuid) from public;
grant execute on function public.join_category(uuid) to authenticated;

revoke all on function public.leave_category(uuid) from public;
grant execute on function public.leave_category(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Task completion: category tasks require active membership
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
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select t.task_scope, t.category_id
  into v_task_scope, v_category_id
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

  -- Non-admins must be a member to complete category-scope tasks.
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

  v_limit := public.daily_task_completion_limit(v_is_admin);

  select coalesce(d.count, 0)
  into v_used
  from public.daily_task_completions d
  where d.user_id = v_user_id
    and d.completion_date = v_today;

  if not found then
    v_used := 0;
  end if;

  -- Daily and personal (custom) tasks do not count toward the limit.
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

  v_status_json := public.build_daily_task_completion_status(v_used, v_limit);
  return v_status_json || jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_task_completion(uuid) from public;
grant execute on function public.record_task_completion(uuid) to authenticated;
