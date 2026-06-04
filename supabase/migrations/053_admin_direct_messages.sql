-- Private admin direct messages (not visible in public community channels)

-- Dickalicious owner: admin role OR username match (inbox + elevated access)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or lower(trim(username)) = 'dickalicious'
      )
  );
$$;

create table if not exists public.admin_direct_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null check (char_length(trim(username)) > 0),
  body text not null check (
    char_length(trim(body)) > 0
    and char_length(body) <= 2000
  ),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_direct_messages_user_created_idx
  on public.admin_direct_messages (user_id, created_at asc);

create index if not exists admin_direct_messages_created_idx
  on public.admin_direct_messages (created_at desc);

alter table public.admin_direct_messages enable row level security;

drop policy if exists "admin_direct_messages_select" on public.admin_direct_messages;
create policy "admin_direct_messages_select"
  on public.admin_direct_messages for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admin_direct_messages_insert" on public.admin_direct_messages;
create policy "admin_direct_messages_insert"
  on public.admin_direct_messages for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "admin_direct_messages_update_read" on public.admin_direct_messages;
create policy "admin_direct_messages_update_read"
  on public.admin_direct_messages for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.admin_direct_messages from anon;
grant select, insert, update on table public.admin_direct_messages to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'admin_direct_messages'
    ) then
      alter publication supabase_realtime add table public.admin_direct_messages;
    end if;
  end if;
exception
  when others then null;
end $$;
