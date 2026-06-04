-- Block self-service updates to Patreon tier/status and role (RLS profiles_update_own was too permissive).
-- Service role (OAuth/webhook) and is_admin() may still change these fields.

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Edge functions / dashboard SQL (service role JWT)
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  -- App admins (role) and owner username bypass (see is_admin())
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.patreon_user_id is distinct from old.patreon_user_id
     or new.patreon_tier is distinct from old.patreon_tier
     or new.patreon_status is distinct from old.patreon_status
     or new.patreon_updated_at is distinct from old.patreon_updated_at then
    raise exception 'profiles_privileged_fields_readonly'
      using errcode = '42501',
            hint = 'Patreon tier and role can only be changed by Patreon sync or an admin.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row
  execute function public.profiles_guard_privileged_columns();

comment on function public.profiles_guard_privileged_columns() is
  'Prevents non-admins from self-granting patreon_tier, patreon_status, role, or patreon_user_id.';

-- Audit (run manually in SQL Editor after deploying):
--   -- Active Slut without Patreon link (likely manual admin or past self-grant exploit):
--   select id, username, role, patreon_tier, patreon_status, patreon_user_id, patreon_updated_at
--   from public.profiles
--   where patreon_tier = 'slut' and patreon_status = 'active'
--   order by patreon_updated_at desc nulls last;
--
--   -- Active tier but never linked Patreon:
--   select id, username, patreon_tier, patreon_status, patreon_user_id
--   from public.profiles
--   where patreon_status = 'active' and patreon_tier is not null and patreon_user_id is null;
