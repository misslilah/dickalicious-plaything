-- Admin watch log: list recent catalog video completions with user + video metadata.

create index if not exists user_video_completions_completed_at_idx
  on public.user_video_completions (completed_at desc);

create or replace function public.admin_list_video_completions(p_limit integer default 100)
returns table (
  user_id uuid,
  username text,
  email text,
  video_id uuid,
  video_title text,
  category_name text,
  completed_at timestamptz,
  xp_awarded integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.user_id,
    p.username,
    u.email,
    c.video_id,
    v.title as video_title,
    vc.name as category_name,
    c.completed_at,
    c.xp_awarded
  from public.user_video_completions c
  inner join public.profiles p on p.id = c.user_id
  inner join auth.users u on u.id = c.user_id
  inner join public.videos v on v.id = c.video_id
  left join public.video_categories vc on vc.id = v.video_category_id
  where public.is_admin()
  order by c.completed_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.admin_list_video_completions(integer) from public;
grant execute on function public.admin_list_video_completions(integer) to authenticated;
