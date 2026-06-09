-- Idempotent: unlock a specific tier-locked video via fixed tier shop prices.
-- Replaces random tier unlock (purchase_tier_video) for user-picked purchases.
-- Safe to run multiple times in Supabase SQL Editor.

create or replace function public.purchase_video_with_points(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.videos%rowtype;
  v_cat_tier text;
  v_eff_tier text;
  v_cost integer;
  v_user_points integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  select * into v_row from public.videos where id = p_video_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Video not found.');
  end if;

  if v_row.shop_points_cost is not null and v_row.shop_points_cost > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'This video is sold individually in the shop.'
    );
  end if;

  select required_tier into v_cat_tier
  from public.video_categories
  where id = v_row.video_category_id;

  v_eff_tier := public.video_effective_tier(v_row.required_tier, v_cat_tier);

  if v_eff_tier not in ('sweetie', 'princess', 'slut') then
    return jsonb_build_object(
      'ok', false,
      'error', 'This video is not available for tier shop purchase.'
    );
  end if;

  v_cost := case v_eff_tier
    when 'sweetie' then 250
    when 'princess' then 400
    when 'slut' then 700
  end;

  if public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'You already have full access.');
  end if;

  if public.tier_rank(v_eff_tier) <= public.user_tier_rank() then
    return jsonb_build_object(
      'ok', false,
      'error', 'You already have Patreon access to this tier.'
    );
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
    'points_remaining', v_user_points - v_cost,
    'video_id', p_video_id,
    'video_title', v_row.title
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'You already own this video.');
end;
$$;

revoke all on function public.purchase_video_with_points(uuid) from public;
grant execute on function public.purchase_video_with_points(uuid) to authenticated;
