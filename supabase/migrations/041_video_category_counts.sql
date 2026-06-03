-- Total video counts per category for display on locked category cards.
-- Bypasses videos RLS; exposes only category_id + count (no video metadata).

create or replace function public.get_video_category_counts()
returns table (
  category_id uuid,
  video_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select video_category_id, count(*)::bigint
  from public.videos
  group by video_category_id;
$$;

revoke all on function public.get_video_category_counts() from public;
grant execute on function public.get_video_category_counts() to authenticated;
