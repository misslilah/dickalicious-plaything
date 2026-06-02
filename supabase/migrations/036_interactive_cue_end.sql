-- Idempotent: optional end_time_ms for persistent interactive video cue ranges.
-- null = point cue (quick) or legacy persistent without an explicit end.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interactive_video_cues'
      and column_name = 'end_time_ms'
  ) then
    alter table public.interactive_video_cues
      add column end_time_ms integer;
  end if;
end $$;

alter table public.interactive_video_cues
  drop constraint if exists interactive_video_cues_end_after_start;

alter table public.interactive_video_cues
  add constraint interactive_video_cues_end_after_start
  check (end_time_ms is null or end_time_ms > time_ms);
