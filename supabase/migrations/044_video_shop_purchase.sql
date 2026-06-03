-- Idempotent: individual video unlock via reward points (shop).
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.videos
  add column if not exists shop_points_cost integer;

comment on column public.videos.shop_points_cost is
  'Points cost for individual unlock in Rewards shop; null or 0 = not purchasable.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'videos_shop_points_cost_nonneg'
      and conrelid = 'public.videos'::regclass
  ) then
    alter table public.videos
      add constraint videos_shop_points_cost_nonneg
      check (shop_points_cost is null or shop_points_cost >= 0);
  end if;
end $$;

create table if not exists public.user_purchased_videos (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists user_purchased_videos_user_id_idx
  on public.user_purchased_videos (user_id);

alter table public.user_purchased_videos enable row level security;

drop policy if exists "user_purchased_videos_select" on public.user_purchased_videos;
create policy "user_purchased_videos_select"
  on public.user_purchased_videos for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

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
    or exists (
      select 1
      from public.user_purchased_videos upv
      where upv.user_id = auth.uid()
        and upv.video_id = id
    )
    or (shop_points_cost is not null and shop_points_cost > 0)
  );

create or replace function public.purchase_video(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.videos%rowtype;
  v_cost integer;
  v_eff_tier text;
  v_user_points integer;
  v_cat_tier text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  select * into v_row from public.videos where id = p_video_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Video not found.');
  end if;

  v_cost := v_row.shop_points_cost;
  if v_cost is null or v_cost <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'This video is not available for individual purchase.'
    );
  end if;

  select required_tier into v_cat_tier
  from public.video_categories
  where id = v_row.video_category_id;

  v_eff_tier := public.video_effective_tier(v_row.required_tier, v_cat_tier);

  if public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'You already have access.');
  end if;

  if public.tier_rank(v_eff_tier) <= public.user_tier_rank() then
    return jsonb_build_object('ok', false, 'error', 'You already have access to this video.');
  end if;

  if exists (
    select 1
    from public.user_purchased_videos
    where user_id = auth.uid()
      and video_id = p_video_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'You already own this video.');
  end if;

  select points into v_user_points
  from public.user_progress
  where user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'User progress not found.');
  end if;

  if v_user_points < v_cost then
    return jsonb_build_object('ok', false, 'error', 'Not enough points.');
  end if;

  update public.user_progress
  set points = points - v_cost,
      updated_at = now()
  where user_id = auth.uid();

  insert into public.user_purchased_videos (user_id, video_id)
  values (auth.uid(), p_video_id);

  return jsonb_build_object(
    'ok', true,
    'points_remaining', v_user_points - v_cost
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'You already own this video.');
end;
$$;

revoke all on function public.purchase_video(uuid) from public;
grant execute on function public.purchase_video(uuid) to authenticated;
