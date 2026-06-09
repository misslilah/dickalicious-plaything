-- Personal training tasks: extend training_tasks with optional assigned_user_id.
-- NULL = global task for all Slut-tier users; non-null = personal task for that user.

alter table public.training_tasks
  add column if not exists assigned_user_id uuid references auth.users (id) on delete cascade;

comment on column public.training_tasks.assigned_user_id is
  'When set, task is visible only to this user on the Training page. NULL = global.';

create index if not exists training_tasks_assigned_user_idx
  on public.training_tasks (assigned_user_id)
  where assigned_user_id is not null;

-- Users read global active tasks + their own personal active tasks; admin reads all.
drop policy if exists "training_tasks_select_active" on public.training_tasks;
create policy "training_tasks_select_active"
  on public.training_tasks for select to authenticated
  using (
    public.is_admin()
    or (
      is_active = true
      and (assigned_user_id is null or assigned_user_id = auth.uid())
    )
  );
