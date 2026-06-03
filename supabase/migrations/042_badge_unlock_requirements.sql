-- Badge unlock requirements (task or category, one-time or accumulated time)
-- and per-user progress toward auto-unlock.

alter table public.badges
  add column if not exists requirement_type text
  check (requirement_type is null or requirement_type in ('task', 'category'));

alter table public.badges
  add column if not exists task_id uuid references public.tasks (id) on delete set null;

alter table public.badges
  add column if not exists category_id uuid references public.categories (id) on delete set null;

alter table public.badges
  add column if not exists duration_seconds int
  check (duration_seconds is null or duration_seconds > 0);

alter table public.badges drop constraint if exists badges_requirement_target_check;
alter table public.badges add constraint badges_requirement_target_check check (
  requirement_type is null
  or (
    requirement_type = 'task'
    and task_id is not null
    and category_id is null
  )
  or (
    requirement_type = 'category'
    and category_id is not null
    and task_id is null
  )
);

create table if not exists public.user_badge_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  accumulated_seconds int not null default 0,
  completed_task_ids uuid[] not null default '{}',
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists user_badge_progress_user_id_idx
  on public.user_badge_progress (user_id);

alter table public.user_badge_progress enable row level security;

drop policy if exists "user_badge_progress_select" on public.user_badge_progress;
create policy "user_badge_progress_select"
  on public.user_badge_progress for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_badge_progress_insert_own" on public.user_badge_progress;
create policy "user_badge_progress_insert_own"
  on public.user_badge_progress for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_badge_progress_update_own" on public.user_badge_progress;
create policy "user_badge_progress_update_own"
  on public.user_badge_progress for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_badge_progress_admin_write" on public.user_badge_progress;
create policy "user_badge_progress_admin_write"
  on public.user_badge_progress for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
