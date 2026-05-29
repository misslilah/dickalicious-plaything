alter table public.tasks
  add column if not exists points_reward int not null default 0;
