-- Idempotent: only category-scope catalog tasks count toward the 3/day completion cap.
-- Daily-scope and custom (personal) tasks bypass the limit entirely.
-- Safe to run multiple times in Supabase SQL Editor.

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
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select t.task_scope
  into v_task_scope
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
