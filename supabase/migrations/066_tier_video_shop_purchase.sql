-- Idempotent: unlock a random tier-locked video via fixed tier shop prices.
-- Safe to run multiple times in Supabase SQL Editor.

-- Allow tier-locked videos above the user's Patreon tier to appear in catalog
-- (needed for Rewards tier shop availability counts; playback still gated).
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
    or public.tier_rank(
      public.video_effective_tier(
        required_tier,
        (
          select vc.required_tier
          from public.video_categories vc
          where vc.id = video_category_id
        )
      )
    ) > public.user_tier_rank()
  );

create or replace function public.purchase_tier_video(p_tier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost integer;
  v_video_id uuid;
  v_video_title text;
  v_user_points integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  if p_tier not in ('sweetie', 'princess', 'slut') then
    return jsonb_build_object('ok', false, 'error', 'Invalid tier.');
  end if;

  v_cost := case p_tier
    when 'sweetie' then 250
    when 'princess' then 400
    when 'slut' then 700
  end;

  if public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'You already have full access.');
  end if;

  if public.tier_rank(p_tier) <= public.user_tier_rank() then
    return jsonb_build_object(
      'ok', false,
      'error', 'You already have Patreon access to this tier.'
    );
  end if;

  select v.id, v.title
  into v_video_id, v_video_title
  from public.videos v
  left join public.video_categories vc on vc.id = v.video_category_id
  where public.video_effective_tier(v.required_tier, vc.required_tier) = p_tier
    and not exists (
      select 1
      from public.user_purchased_videos upv
      where upv.user_id = auth.uid()
        and upv.video_id = v.id
    )
  order by random()
  limit 1;

  if v_video_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'No videos left in this tier to unlock.'
    );
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
  values (auth.uid(), v_video_id);

  return jsonb_build_object(
    'ok', true,
    'points_remaining', v_user_points - v_cost,
    'video_id', v_video_id,
    'video_title', v_video_title
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'You already own this video.');
end;
$$;

revoke all on function public.purchase_tier_video(text) from public;
grant execute on function public.purchase_tier_video(text) to authenticated;
