-- 097 — Profile social layer: avatars, bio, banners, visitable profiles, user DMs
--
-- Run in the Supabase SQL Editor (safe to re-run).
--
-- What this adds
--   1. profiles.avatar_url, bio, banner_id, owned_banner_ids
--   2. Storage bucket `avatars` (public read; authenticated write to own folder)
--   3. Authenticated SELECT on profiles so members can visit each other
--      (client/RPC only expose username, avatar, bio, banner, character, presence —
--      not email or admin/Patreon secrets)
--   4. user_badges readable by authenticated users (show unlocked badges on profiles)
--   5. user_direct_messages (from_id, to_id, body, created_at, read_at)
--      + RLS (participants select/insert; recipient updates read_at) + realtime
--   6. get_public_profile(lookup) — UUID or username → public card + badge ids
--      + public progress chips (level, xp, streak). No email, role, points, malus,
--      blackmail, or Patreon ids.
--
-- Shop banners live in src/lib/profileBanners.ts (free defaults dusk + rose).
-- Admin Dickalicious DMs (admin_direct_messages) are unchanged.
--
-- If you later change get_public_profile return columns, DROP FUNCTION first:
--   drop function if exists public.get_public_profile(text);
-- Use `delete from … where true` inside functions (never unscoped DELETE).

-- ---------------------------------------------------------------------------
-- Profile columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists bio text not null default '',
  add column if not exists banner_id text not null default 'dusk',
  add column if not exists owned_banner_ids jsonb not null default '["dusk","rose"]'::jsonb;

comment on column public.profiles.avatar_url is
  'Public URL of the user avatar in the avatars storage bucket.';
comment on column public.profiles.bio is
  'Short public description (max 280). Editable on own profile.';
comment on column public.profiles.banner_id is
  'Selected banner from the shop catalog (src/lib/profileBanners.ts). Default dusk.';
comment on column public.profiles.owned_banner_ids is
  'JSON array of banner ids the user may equip. Free defaults: dusk, rose.';

alter table public.profiles
  drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length
  check (char_length(bio) <= 280);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_owned_banner_ids_array'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_owned_banner_ids_array
      check (jsonb_typeof(owned_banner_ids) = 'array');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Visitable profiles (row-level). Clients must select public columns only.
-- Email is not on profiles. Privileged update fields stay guarded by 055.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "user_badges_select" on public.user_badges;
create policy "user_badges_select"
  on public.user_badges for select to authenticated
  using (true);

create or replace view public.public_profiles
with (security_invoker = true) as
select
  id,
  username,
  avatar_url,
  bio,
  banner_id,
  character_gender,
  character_breast_size,
  character_penis_size,
  character_equipped,
  last_seen_at,
  created_at
from public.profiles;

grant select on public.public_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Public profile RPC (safe fields only)
-- ---------------------------------------------------------------------------
drop function if exists public.get_public_profile(text);

create function public.get_public_profile(p_lookup text)
returns table (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  banner_id text,
  character_gender text,
  character_breast_size text,
  character_penis_size text,
  character_equipped jsonb,
  last_seen_at timestamptz,
  current_level int,
  total_xp int,
  streak int,
  badge_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pid uuid;
  lookup text;
begin
  lookup := trim(coalesce(p_lookup, ''));
  if lookup = '' then
    return;
  end if;

  if lookup ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into pid
    from public.profiles p
    where p.id = lookup::uuid;
  else
    select p.id into pid
    from public.profiles p
    where lower(p.username) = lower(lookup);
  end if;

  if pid is null then
    return;
  end if;

  return query
  select
    p.id,
    p.username,
    p.avatar_url,
    p.bio,
    p.banner_id,
    p.character_gender,
    p.character_breast_size,
    p.character_penis_size,
    p.character_equipped,
    p.last_seen_at,
    up.current_level,
    up.total_xp,
    up.streak,
    coalesce((
      select array_agg(ub.badge_id)
      from public.user_badges ub
      where ub.user_id = p.id
    ), '{}'::uuid[])
  from public.profiles p
  left join public.user_progress up on up.user_id = p.id
  where p.id = pid;
end;
$$;

comment on function public.get_public_profile(text) is
  'Public profile card by user id or username. No email, role, points, or admin secrets.';

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Avatars bucket (authenticated write to {userId}/…, public read)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- User-to-user private messages
-- ---------------------------------------------------------------------------
create table if not exists public.user_direct_messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (
    char_length(trim(body)) > 0
    and char_length(body) <= 2000
  ),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint user_direct_messages_not_self check (from_id <> to_id)
);

create index if not exists user_direct_messages_from_created_idx
  on public.user_direct_messages (from_id, created_at asc);

create index if not exists user_direct_messages_to_created_idx
  on public.user_direct_messages (to_id, created_at desc);

create index if not exists user_direct_messages_peer_idx
  on public.user_direct_messages (least(from_id, to_id), greatest(from_id, to_id), created_at);

alter table public.user_direct_messages enable row level security;

drop policy if exists "user_direct_messages_select" on public.user_direct_messages;
create policy "user_direct_messages_select"
  on public.user_direct_messages for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "user_direct_messages_insert" on public.user_direct_messages;
create policy "user_direct_messages_insert"
  on public.user_direct_messages for insert to authenticated
  with check (from_id = auth.uid() and from_id <> to_id);

drop policy if exists "user_direct_messages_update_read" on public.user_direct_messages;
create policy "user_direct_messages_update_read"
  on public.user_direct_messages for update to authenticated
  using (to_id = auth.uid())
  with check (to_id = auth.uid());

revoke all on table public.user_direct_messages from anon;
grant select, insert, update on table public.user_direct_messages to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_direct_messages'
    ) then
      alter publication supabase_realtime add table public.user_direct_messages;
    end if;
  end if;
exception
  when others then null;
end $$;
