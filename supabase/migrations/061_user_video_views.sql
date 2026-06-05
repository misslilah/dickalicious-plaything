-- Idempotent: partial video views + unified admin watch log.
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.user_video_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  watch_percent numeric(5, 2),
  view_type text not null check (view_type in ('partial', 'full')),
  view_date date not null default ((timezone('utc', now()))::date),
  constraint user_video_views_watch_percent_range
    check (watch_percent is null or (watch_percent >= 0 and watch_percent <= 100))
);

-- One partial row per user / video / UTC day; upsert refreshes time and max percent.
create unique index if not exists user_video_views_partial_daily_uniq
  on public.user_video_views (user_id, video_id, view_date)
  where view_type = 'partial';

create index if not exists user_video_views_viewed_at_idx
  on public.user_video_views (viewed_at desc);

create index if not exists user_video_views_user_id_idx
  on public.user_video_views (user_id);

alter table public.user_video_views enable row level security;

drop policy if exists "user_video_views_select" on public.user_video_views;
create policy "user_video_views_select"
  on public.user_video_views for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_video_views_insert_own" on public.user_video_views;
create policy "user_video_views_insert_own"
  on public.user_video_views for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_video_views_update_own" on public.user_video_views;
create policy "user_video_views_update_own"
  on public.user_video_views for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.record_video_partial_view(
  p_video_id uuid,
  p_watch_percent numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('utc', now()))::date;
  v_pct numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_watch_percent is not null then
    v_pct := greatest(0, least(100, p_watch_percent));
  end if;

  insert into public.user_video_views (user_id, video_id, watch_percent, view_type, view_date)
  values (auth.uid(), p_video_id, v_pct, 'partial', v_today)
  on conflict (user_id, video_id, view_date)
  where view_type = 'partial'
  do update set
    viewed_at = now(),
    watch_percent = case
      when excluded.watch_percent is null then public.user_video_views.watch_percent
      when public.user_video_views.watch_percent is null then excluded.watch_percent
      else greatest(public.user_video_views.watch_percent, excluded.watch_percent)
    end;
end;
$$;

revoke all on function public.record_video_partial_view(uuid, numeric) from public;
grant execute on function public.record_video_partial_view(uuid, numeric) to authenticated;

create or replace function public.admin_list_video_watch_log(p_limit integer default 150)
returns table (
  log_id text,
  user_id uuid,
  username text,
  email text,
  video_id uuid,
  video_title text,
  category_name text,
  watched_at timestamptz,
  view_type text,
  watch_percent numeric,
  xp_awarded integer
)
language sql
stable
security definer
set search_path = public
as $$
  with entries as (
    select
      ('full:' || c.user_id::text || ':' || c.video_id::text)::text as log_id,
      c.user_id,
      c.video_id,
      c.completed_at as watched_at,
      'full'::text as view_type,
      100::numeric as watch_percent,
      c.xp_awarded
    from public.user_video_completions c

    union all

    select
      ('partial:' || v.id::text)::text as log_id,
      v.user_id,
      v.video_id,
      v.viewed_at as watched_at,
      'partial'::text as view_type,
      v.watch_percent,
      0 as xp_awarded
    from public.user_video_views v
    where v.view_type = 'partial'
  )
  select
    e.log_id,
    e.user_id,
    p.username,
    u.email,
    e.video_id,
    vid.title as video_title,
    vc.name as category_name,
    e.watched_at,
    e.view_type,
    e.watch_percent,
    e.xp_awarded
  from entries e
  inner join public.profiles p on p.id = e.user_id
  inner join auth.users u on u.id = e.user_id
  inner join public.videos vid on vid.id = e.video_id
  left join public.video_categories vc on vc.id = vid.video_category_id
  where public.is_admin()
  order by e.watched_at desc
  limit greatest(1, least(coalesce(p_limit, 150), 500));
$$;

revoke all on function public.admin_list_video_watch_log(integer) from public;
grant execute on function public.admin_list_video_watch_log(integer) to authenticated;
