-- Task audience by user stage (replaces min_level gating)
alter table public.tasks
  add column if not exists user_stage text
  check (user_stage in ('beginner', 'intermediate', 'trained', 'mindless', 'any'));

update public.tasks
set user_stage = 'any'
where user_stage is null;

alter table public.tasks
  alter column user_stage set default 'any';

alter table public.tasks
  alter column user_stage set not null;

-- Relax reward level badges beyond the old 1–5 cap
alter table public.rewards
  drop constraint if exists rewards_level_required_check;

alter table public.rewards
  add constraint rewards_level_required_check
  check (level_required is null or level_required >= 1);
