-- Admin batch malus reset for all users.

create or replace function public.admin_reset_all_malus()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.user_progress
  set malus_points = 0,
      updated_at = now()
  where coalesce(malus_points, 0) > 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_reset_all_malus() from public;
grant execute on function public.admin_reset_all_malus() to authenticated;
