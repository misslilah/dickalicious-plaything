-- 012 — duration completion requirement (persists across browser sessions).
-- Timer (timer_seconds) resets when the player leaves the task page; duration does not.

alter table public.tasks
  add column if not exists duration_seconds integer;
