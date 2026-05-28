-- Malus points, category membership, punishment difficulty

-- Categories: minimum user stage to join (null = anyone)
alter table public.categories
  add column if not exists required_stage text
  check (required_stage is null or required_stage in ('beginner', 'intermediate', 'trained', 'mindless'));

-- Category membership
create table if not exists public.category_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create index if not exists category_members_category_id_idx
  on public.category_members (category_id);

-- Tasks: malus when started / daily incomplete at day end
alter table public.tasks
  add column if not exists malus_points_on_fail int not null default 0;

-- Punishment templates: difficulty tier + malus relief
alter table public.punishment_templates
  add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy', 'medium', 'hard'));

alter table public.punishment_templates
  add column if not exists malus_points_relieved int not null default 0;

-- User progress: malus balance
alter table public.user_progress
  add column if not exists malus_points int not null default 0;

-- RLS: category_members
alter table public.category_members enable row level security;

drop policy if exists "category_members_select_own" on public.category_members;
create policy "category_members_select_own"
  on public.category_members for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "category_members_insert_own" on public.category_members;
create policy "category_members_insert_own"
  on public.category_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "category_members_delete_own" on public.category_members;
create policy "category_members_delete_own"
  on public.category_members for delete
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "category_members_admin_all" on public.category_members;
create policy "category_members_admin_all"
  on public.category_members for all
  using (public.is_admin())
  with check (public.is_admin());

-- Allow malus_relief trigger type
alter table public.punishment_templates
  drop constraint if exists punishment_templates_trigger_type_check;

alter table public.punishment_templates
  add constraint punishment_templates_trigger_type_check
  check (trigger_type in ('quota_miss', 'manual', 'malus_relief'));

-- Backfill default malus relief from legacy points_lost where unset
update public.punishment_templates
set malus_points_relieved = greatest(points_lost, 5)
where malus_points_relieved = 0 and points_lost > 0;

update public.punishment_templates
set trigger_type = 'malus_relief', difficulty = coalesce(difficulty, 'medium')
where trigger_type = 'quota_miss';
