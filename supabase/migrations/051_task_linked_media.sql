-- 051 — optional linked video/audio on tasks (must finish playback before completing).
-- Idempotent; safe to run multiple times.

alter table public.tasks
  add column if not exists linked_media_type text;

update public.tasks
set linked_media_type = 'none'
where linked_media_type is null;

alter table public.tasks
  alter column linked_media_type set default 'none';

alter table public.tasks
  alter column linked_media_type set not null;

alter table public.tasks
  drop constraint if exists tasks_linked_media_type_check;

alter table public.tasks
  add constraint tasks_linked_media_type_check
  check (linked_media_type in ('none', 'video', 'audio'));

alter table public.tasks
  add column if not exists linked_video_id uuid references public.videos (id) on delete set null;

alter table public.tasks
  add column if not exists linked_audio_item_id uuid references public.audio_playlist_items (id) on delete set null;

alter table public.tasks
  add column if not exists linked_audio_url text;

alter table public.tasks
  drop constraint if exists tasks_linked_media_video_check;

alter table public.tasks
  add constraint tasks_linked_media_video_check
  check (linked_media_type <> 'video' or linked_video_id is not null);

alter table public.tasks
  drop constraint if exists tasks_linked_media_audio_check;

alter table public.tasks
  add constraint tasks_linked_media_audio_check
  check (
    linked_media_type <> 'audio'
    or linked_audio_item_id is not null
    or (linked_audio_url is not null and length(trim(linked_audio_url)) > 0)
  );
