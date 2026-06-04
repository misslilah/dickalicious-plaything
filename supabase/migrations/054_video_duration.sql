-- Idempotent: catalog video duration for list UI.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.videos
  add column if not exists duration_seconds real;

comment on column public.videos.duration_seconds is
  'Length in seconds from upload metadata; null for legacy uploads.';
