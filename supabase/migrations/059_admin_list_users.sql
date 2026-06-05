-- Admin-only user list with auth email (client cannot read auth.users directly).

create or replace function public.admin_list_users()
returns table (
  id uuid,
  username text,
  email text,
  role text,
  patreon_user_id text,
  patreon_tier text,
  patreon_status text
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
    p.patreon_status
  from public.profiles p
  inner join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.username;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;
