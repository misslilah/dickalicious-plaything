-- Task media playback mode: inline preview player vs ambient background on Start.

alter table public.tasks
  add column if not exists task_media_playback text not null default 'inline'
    check (task_media_playback in ('inline', 'ambient'));

comment on column public.tasks.task_media_playback is
  'inline = show controls in task info; ambient = 40% opacity background when user clicks Start.';
