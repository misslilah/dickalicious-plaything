-- Task scope: category (library), daily (home plan), custom (per-user)

alter table public.tasks
  add column if not exists task_scope text not null default 'category'
  check (task_scope in ('category', 'daily', 'custom'));

alter table public.tasks
  alter column category_id drop not null;

alter table public.tasks
  add column if not exists assigned_user_id uuid references auth.users (id) on delete cascade;

alter table public.tasks drop constraint if exists tasks_scope_category_requires_category;
alter table public.tasks
  add constraint tasks_scope_category_requires_category
  check (task_scope <> 'category' or category_id is not null);

alter table public.tasks drop constraint if exists tasks_scope_custom_requires_user;
alter table public.tasks
  add constraint tasks_scope_custom_requires_user
  check (task_scope <> 'custom' or assigned_user_id is not null);

-- Optional backfill (comment only — do not auto-run ambiguous migrations):
-- update public.tasks set task_scope = 'daily'
-- where frequency = 'daily' and task_scope = 'category' and category_id is null;
