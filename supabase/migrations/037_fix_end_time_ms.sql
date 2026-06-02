-- Standalone repair: add interactive_video_cues.end_time_ms if missing.
-- Paste into Supabase SQL Editor when uploads fail with:
--   Could not find the 'end_time_ms' column of 'interactive_video_cues' in the schema cache
-- Safe to run multiple times.

alter table public.interactive_video_cues
  add column if not exists end_time_ms integer;

alter table public.interactive_video_cues
  drop constraint if exists interactive_video_cues_end_after_start;

alter table public.interactive_video_cues
  add constraint interactive_video_cues_end_after_start
  check (end_time_ms is null or end_time_ms > time_ms);

-- Ask PostgREST to reload its schema cache (may take a few seconds).
notify pgrst, 'reload schema';
