-- Idempotent: admin can enable loop by default for a catalog video.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.videos
  add column if not exists auto_loop boolean not null default false;

comment on column public.videos.auto_loop is
  'When true, normal playback starts with loop enabled and shows a one-time loop notice.';
