-- Resolve auth.users.email from profile username for username-only login.
-- Returns null when no match (client must not distinguish "unknown user" from bad password).
-- Apply rate limiting at the edge/API gateway if abuse becomes a concern.

create or replace function public.resolve_login_email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  inner join auth.users u on u.id = p.id
  where lower(trim(p.username)) = lower(trim(p_username))
  limit 1;
$$;

revoke all on function public.resolve_login_email_for_username(text) from public;
grant execute on function public.resolve_login_email_for_username(text) to anon, authenticated;
