-- Per-task uploaded video or audio (admin upload, authenticated read).

alter table public.tasks
  add column if not exists task_media_url text,
  add column if not exists task_media_type text check (
    task_media_type is null
    or task_media_type in ('video', 'audio')
  );

comment on column public.tasks.task_media_url is
  'Public URL for task-specific uploaded video or audio.';
comment on column public.tasks.task_media_type is
  'video or audio — matches task_media_url content.';

-- Storage bucket (public read, admin write).
insert into storage.buckets (id, name, public)
values ('task-media', 'task-media', true)
on conflict (id) do nothing;

drop policy if exists "task_media_public_read" on storage.objects;
create policy "task_media_public_read"
  on storage.objects for select
  using (bucket_id = 'task-media');

drop policy if exists "task_media_admin_write" on storage.objects;
create policy "task_media_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'task-media' and public.is_admin())
  with check (bucket_id = 'task-media' and public.is_admin());
