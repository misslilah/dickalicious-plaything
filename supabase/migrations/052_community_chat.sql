-- Tier-gated community chat (global + Sweetie / Princess / Slut channels)

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('global', 'sweetie', 'princess', 'slut')),
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null check (char_length(trim(username)) > 0),
  body text not null check (
    char_length(trim(body)) > 0
    and char_length(body) <= 2000
  ),
  created_at timestamptz not null default now()
);

create index if not exists community_messages_channel_created_idx
  on public.community_messages (channel, created_at desc);

alter table public.community_messages enable row level security;

-- Cumulative tier access: higher patrons may read/post lower-tier rooms; not the reverse.
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
      or channel = 'global'
      or public.user_tier_rank() >= public.tier_rank(channel)
    );
$$;

drop policy if exists "community_messages_select" on public.community_messages;
create policy "community_messages_select"
  on public.community_messages for select to authenticated
  using (public.can_access_community_channel(channel));

drop policy if exists "community_messages_insert" on public.community_messages;
create policy "community_messages_insert"
  on public.community_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_access_community_channel(channel)
  );

revoke all on table public.community_messages from anon;
grant select, insert on table public.community_messages to authenticated;

-- Realtime (best effort; enable in Dashboard if this block is skipped locally)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'community_messages'
    ) then
      alter publication supabase_realtime add table public.community_messages;
    end if;
  end if;
exception
  when others then null;
end $$;
