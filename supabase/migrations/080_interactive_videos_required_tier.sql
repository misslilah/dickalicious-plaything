-- Patreon tier gating for interactive videos (run after 035_interactive_videos.sql).

alter table public.interactive_videos
  add column if not exists required_tier text default 'sweetie'
    check (required_tier is null or required_tier in ('public', 'sweetie', 'princess', 'slut'));

update public.interactive_videos
set required_tier = 'sweetie'
where required_tier is null;

drop policy if exists "interactive_videos_select" on public.interactive_videos;
create policy "interactive_videos_select"
  on public.interactive_videos for select to authenticated
  using (
    public.is_admin()
    or public.tier_rank(coalesce(required_tier, 'sweetie')) <= public.user_tier_rank()
  );

drop policy if exists "interactive_video_cues_select" on public.interactive_video_cues;
create policy "interactive_video_cues_select"
  on public.interactive_video_cues for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.interactive_videos iv
      where iv.id = video_id
        and public.tier_rank(coalesce(iv.required_tier, 'sweetie')) <= public.user_tier_rank()
    )
  );
