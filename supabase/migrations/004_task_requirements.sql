-- Task completion requirements: timer, open URL, required phrase

alter table public.tasks
  add column if not exists timer_seconds integer,
  add column if not exists open_url text,
  add column if not exists required_phrase text;
