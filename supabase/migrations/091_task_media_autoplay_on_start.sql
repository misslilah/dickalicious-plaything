-- Optional autoplay when the user clicks Start (display mode still uses task_media_playback).

alter table public.tasks
  add column if not exists task_media_autoplay_on_start boolean not null default false;

comment on column public.tasks.task_media_autoplay_on_start is
  'When true, task media plays after the user clicks Start (ambient or inline per task_media_playback).';
