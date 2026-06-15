-- Admin malus reset + extend user list with malus balance + block task completion when malus > 0.

-- ---------------------------------------------------------------------------
-- Admin reset malus for a user
-- ---------------------------------------------------------------------------

create or replace function public.admin_reset_user_malus(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select coalesce(up.malus_points, 0)
  into v_previous
  from public.user_progress up
  where up.user_id = p_user_id;

  if not found then
    insert into public.user_progress (user_id, malus_points)
    values (p_user_id, 0)
    on conflict (user_id) do update
      set malus_points = 0,
          updated_at = now();
    return 0;
  end if;

  update public.user_progress
  set malus_points = 0,
      updated_at = now()
  where user_id = p_user_id;

  return v_previous;
end;
$$;

revoke all on function public.admin_reset_user_malus(uuid) from public;
grant execute on function public.admin_reset_user_malus(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin user list: include malus balance
-- ---------------------------------------------------------------------------

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  id uuid,
  username text,
  email text,
  role text,
  patreon_user_id text,
  patreon_tier text,
  patreon_status text,
  malus_points integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    u.email,
    p.role,
    p.patreon_user_id,
    p.patreon_tier,
    p.patreon_status,
    coalesce(up.malus_points, 0) as malus_points
  from public.profiles p
  inner join auth.users u on u.id = p.id
  left join public.user_progress up on up.user_id = p.id
  where public.is_admin()
  order by p.username;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- ---------------------------------------------------------------------------
-- Block category task completion recording when user has active malus
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
    and exists (
      select 1
      from public.user_progress up
      where up.user_id = v_user_id
        and coalesce(up.malus_points, 0) > 0
    )
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'active_malus'
    );
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
