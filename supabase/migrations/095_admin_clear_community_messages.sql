-- Admin-only wipe of all community chat messages (all channels, including announcements).
-- Does not delete admin direct messages (admin_direct_messages).

create or replace function public.admin_clear_community_messages()
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

  -- WHERE true: required by Supabase SQL Editor (blocks DELETE/UPDATE without WHERE).
  -- Reactions cascade from community_messages, but delete them first if the FK is missing.
  if to_regclass('public.community_message_reactions') is not null then
    delete from public.community_message_reactions where true;
  end if;

  delete from public.community_messages where true;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

comment on function public.admin_clear_community_messages() is
  'Admin only. Deletes every community chat message (all channels, including announcements) '
  'and their reactions. Does not delete admin direct messages.';

revoke all on function public.admin_clear_community_messages() from public;
grant execute on function public.admin_clear_community_messages() to authenticated;
