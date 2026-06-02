-- Idempotent: interactive videos with timeline cue points + storage bucket.
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.interactive_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text not null,
  duration_seconds real,
  created_at timestamptz default now()
);

create index if not exists interactive_videos_created_at_idx
  on public.interactive_videos (created_at desc);

create table if not exists public.interactive_video_cues (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.interactive_videos (id) on delete cascade,
  time_ms integer not null check (time_ms >= 0),
  command_type text not null check (command_type in ('sniff', 'mouth_open', 'tongue_out')),
  persistent boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists interactive_video_cues_video_id_idx
  on public.interactive_video_cues (video_id, time_ms);

alter table public.interactive_videos enable row level security;
alter table public.interactive_video_cues enable row level security;

drop policy if exists "interactive_videos_select" on public.interactive_videos;
create policy "interactive_videos_select"
  on public.interactive_videos for select to authenticated
  using (true);

drop policy if exists "interactive_videos_write" on public.interactive_videos;
create policy "interactive_videos_write"
  on public.interactive_videos for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "interactive_video_cues_select" on public.interactive_video_cues;
create policy "interactive_video_cues_select"
  on public.interactive_video_cues for select to authenticated
  using (true);

drop policy if exists "interactive_video_cues_write" on public.interactive_video_cues;
create policy "interactive_video_cues_write"
  on public.interactive_video_cues for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('interactive-videos', 'interactive-videos', true)
on conflict (id) do nothing;

drop policy if exists "interactive_videos_storage_read" on storage.objects;
create policy "interactive_videos_storage_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'interactive-videos');

drop policy if exists "interactive_videos_storage_admin_write" on storage.objects;
create policy "interactive_videos_storage_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'interactive-videos' and public.is_admin())
  with check (bucket_id = 'interactive-videos' and public.is_admin());
