-- Idempotent repair: ensure all `tasks` columns the app expects (migrations 004–007).
-- Safe to run multiple times in Supabase SQL Editor.

-- 004 — completion requirements
alter table public.tasks
  add column if not exists timer_seconds integer,
  add column if not exists duration_seconds integer,
  add column if not exists open_url text,
  add column if not exists required_phrase text;

-- 005 — user stage (replaces min_level gating in the app)
alter table public.tasks
  add column if not exists user_stage text;

update public.tasks
set user_stage = 'any'
where user_stage is null;

alter table public.tasks
  alter column user_stage set default 'any';

alter table public.tasks
  alter column user_stage set not null;

alter table public.tasks
  drop constraint if exists tasks_user_stage_check;

alter table public.tasks
  add constraint tasks_user_stage_check
  check (user_stage in ('beginner', 'intermediate', 'trained', 'mindless', 'any'));

-- 006 — task scope, nullable category, assigned user
alter table public.tasks
  add column if not exists task_scope text;

update public.tasks
set task_scope = 'category'
where task_scope is null;

alter table public.tasks
  alter column task_scope set default 'category';

alter table public.tasks
  alter column task_scope set not null;

alter table public.tasks
  drop constraint if exists tasks_task_scope_check;

alter table public.tasks
  add constraint tasks_task_scope_check
  check (task_scope in ('category', 'daily', 'custom'));

alter table public.tasks
  alter column category_id drop not null;

alter table public.tasks
  add column if not exists assigned_user_id uuid references auth.users (id) on delete cascade;

alter table public.tasks
  drop constraint if exists tasks_scope_category_requires_category;

alter table public.tasks
  add constraint tasks_scope_category_requires_category
  check (task_scope <> 'category' or category_id is not null);

alter table public.tasks
  drop constraint if exists tasks_scope_custom_requires_user;

alter table public.tasks
  add constraint tasks_scope_custom_requires_user
  check (task_scope <> 'custom' or assigned_user_id is not null);

-- 007 — malus on fail
alter table public.tasks
  add column if not exists malus_points_on_fail int;

update public.tasks
set malus_points_on_fail = 0
where malus_points_on_fail is null;

alter table public.tasks
  alter column malus_points_on_fail set default 0;

alter table public.tasks
  alter column malus_points_on_fail set not null;
