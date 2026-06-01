-- Idempotent: optional forced-viewing mode on catalog videos.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.videos
  add column if not exists forced_mode boolean not null default false;

comment on column public.videos.forced_mode is
  'When true, playback uses forced mode (fullscreen overlay, no pause) until the video ends.';
