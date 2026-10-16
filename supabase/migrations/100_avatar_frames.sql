-- 100 — Avatar frame cosmetics (contours around the profile photo)
--
-- Run in the Supabase SQL Editor (safe to re-run).
--
-- What this adds
--   1. profiles.avatar_frame_id (equipped contour; default 'none')
--   2. profiles.owned_avatar_frame_ids (json array of owned ids)
--   3. public_profiles + get_public_profile expose the equipped frame
--
-- Catalog lives in src/lib/avatarFrames.ts (none is free; others sell in Shop).

alter table public.profiles
  add column if not exists avatar_frame_id text not null default 'none',
  add column if not exists owned_avatar_frame_ids jsonb not null default '["none"]'::jsonb;

comment on column public.profiles.avatar_frame_id is
  'Equipped avatar contour from src/lib/avatarFrames.ts. none = bare photo.';
comment on column public.profiles.owned_avatar_frame_ids is
  'JSON array of avatar frame ids the user may equip. Free default: none.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_owned_avatar_frame_ids_array'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_owned_avatar_frame_ids_array
      check (jsonb_typeof(owned_avatar_frame_ids) = 'array');
  end if;
end
$$;

create or replace view public.public_profiles
with (security_invoker = true) as
select
  id,
  username,
  avatar_url,
  bio,
  banner_id,
  avatar_frame_id,
  character_gender,
  character_breast_size,
  character_penis_size,
  character_equipped,
  last_seen_at,
  created_at
from public.profiles;

grant select on public.public_profiles to authenticated;

drop function if exists public.get_public_profile(text);

create function public.get_public_profile(p_lookup text)
returns table (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  banner_id text,
  avatar_frame_id text,
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
    p.avatar_frame_id,
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
  'Public profile card by user id or username. Includes equipped avatar frame. No email, role, points, or admin secrets.';

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to authenticated;
