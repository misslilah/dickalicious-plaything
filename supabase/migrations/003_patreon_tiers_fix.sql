-- Idempotent fix for partial 002_patreon_tiers runs (safe to re-run in SQL Editor)

-- 1. Ensure columns exist before functions/policies reference them

alter table public.profiles
  add column if not exists patreon_user_id text,
  add column if not exists patreon_tier text check (patreon_tier is null or patreon_tier in ('sweetie', 'princess', 'slut')),
  add column if not exists patreon_status text not null default 'none'
    check (patreon_status in ('active', 'cancelled', 'none')),
  add column if not exists patreon_updated_at timestamptz;

alter table public.videos
  add column if not exists required_tier text default 'sweetie'
    check (required_tier is null or required_tier in ('public', 'sweetie', 'princess', 'slut'));

alter table public.video_categories
  add column if not exists required_tier text
    check (required_tier is null or required_tier in ('public', 'sweetie', 'princess', 'slut'));

update public.videos set required_tier = 'sweetie' where required_tier is null;

-- 2. Recreate functions (002 may have created tier_rank but failed on user_tier_rank)

create or replace function public.tier_rank(tier text)
returns int
language sql
immutable
as $$
  select case lower(coalesce(tier, 'public'))
    when 'public' then 0
    when 'sweetie' then 1
    when 'princess' then 2
    when 'slut' then 3
    else 0
  end;
$$;

create or replace function public.user_tier_rank()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.tier_rank(p.patreon_tier)
      from public.profiles p
      where p.id = auth.uid()
        and p.patreon_status = 'active'
        and p.patreon_tier is not null
    ),
    0
  );
$$;

create or replace function public.video_effective_tier(
  video_tier text,
  category_tier text
)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(video_tier), ''), nullif(trim(category_tier), ''), 'public');
$$;

create or replace function public.user_can_access_tier(required text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.tier_rank(required) <= public.user_tier_rank();
$$;

-- 3. Recreate tier-gated policies

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "video_categories_select" on public.video_categories;
create policy "video_categories_select"
  on public.video_categories for select to authenticated
  using (
    public.is_admin()
    or public.tier_rank(coalesce(required_tier, 'public')) <= public.user_tier_rank()
  );

drop policy if exists "videos_select" on public.videos;
create policy "videos_select"
  on public.videos for select to authenticated
  using (
    public.is_admin()
    or public.tier_rank(
      public.video_effective_tier(
        required_tier,
        (
          select vc.required_tier
          from public.video_categories vc
          where vc.id = video_category_id
        )
      )
    ) <= public.user_tier_rank()
  );
