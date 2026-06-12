-- Announcements channel (read-only for members) + admin delete/heart on community messages

-- Extend allowed channels
alter table public.community_messages
  drop constraint if exists community_messages_channel_check;

alter table public.community_messages
  add constraint community_messages_channel_check
  check (channel in ('global', 'announcements', 'sweetie', 'princess', 'slut'));

-- All authenticated users may read announcements; tier rules unchanged for other channels.
create or replace function public.can_access_community_channel(channel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.is_admin()
      or channel in ('global', 'announcements')
      or public.user_tier_rank() >= public.tier_rank(channel)
    );
$$;

drop policy if exists "community_messages_insert" on public.community_messages;
create policy "community_messages_insert"
  on public.community_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (channel = 'announcements' and public.is_admin())
      or (channel <> 'announcements' and public.can_access_community_channel(channel))
    )
  );

drop policy if exists "community_messages_delete" on public.community_messages;
create policy "community_messages_delete"
  on public.community_messages for delete to authenticated
  using (public.is_admin());

grant delete on table public.community_messages to authenticated;

-- Admin heart reactions (one per admin per message)
create table if not exists public.community_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null check (reaction = 'heart'),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);

create index if not exists community_message_reactions_message_id_idx
  on public.community_message_reactions (message_id);

alter table public.community_message_reactions enable row level security;

drop policy if exists "community_message_reactions_select" on public.community_message_reactions;
create policy "community_message_reactions_select"
  on public.community_message_reactions for select to authenticated
  using (
    exists (
      select 1
      from public.community_messages m
      where m.id = message_id
        and public.can_access_community_channel(m.channel)
    )
  );

drop policy if exists "community_message_reactions_insert" on public.community_message_reactions;
create policy "community_message_reactions_insert"
  on public.community_message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_admin()
    and exists (
      select 1
      from public.community_messages m
      where m.id = message_id
        and public.can_access_community_channel(m.channel)
    )
  );

drop policy if exists "community_message_reactions_delete" on public.community_message_reactions;
create policy "community_message_reactions_delete"
  on public.community_message_reactions for delete to authenticated
  using (user_id = auth.uid() and public.is_admin());

revoke all on table public.community_message_reactions from anon;
grant select, insert, delete on table public.community_message_reactions to authenticated;

-- Realtime (best effort)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'community_message_reactions'
    ) then
      alter publication supabase_realtime add table public.community_message_reactions;
    end if;
  end if;
exception
  when others then null;
end $$;
