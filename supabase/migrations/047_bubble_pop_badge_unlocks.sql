-- Hidden per-user soap bubble pop counter and badge unlock by pop threshold.
-- Idempotent: safe to run multiple times in Supabase SQL Editor.

create table if not exists public.user_bubble_pop_counts (
  user_id uuid not null references auth.users (id) on delete cascade,
  pop_count integer not null default 0 check (pop_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

do $$ begin
  alter table public.user_bubble_pop_counts
    add constraint user_bubble_pop_counts_user_id_profiles_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

alter table public.user_bubble_pop_counts enable row level security;

drop policy if exists "user_bubble_pop_counts_select_own" on public.user_bubble_pop_counts;
create policy "user_bubble_pop_counts_select_own"
  on public.user_bubble_pop_counts for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

alter table public.badges
  add column if not exists min_bubble_pops int
  check (min_bubble_pops is null or min_bubble_pops > 0);

alter table public.badges drop constraint if exists badges_requirement_type_check;
alter table public.badges add constraint badges_requirement_type_check check (
  requirement_type is null
  or requirement_type in ('task', 'category', 'bubble_pops')
);

alter table public.badges drop constraint if exists badges_requirement_target_check;
alter table public.badges add constraint badges_requirement_target_check check (
  requirement_type is null
  or (
    requirement_type = 'task'
    and task_id is not null
    and category_id is null
    and min_bubble_pops is null
  )
  or (
    requirement_type = 'category'
    and category_id is not null
    and task_id is null
    and min_bubble_pops is null
  )
  or (
    requirement_type = 'bubble_pops'
    and min_bubble_pops is not null
    and min_bubble_pops > 0
    and task_id is null
    and category_id is null
    and duration_seconds is null
  )
);

create or replace function public.increment_user_bubble_pop_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_bubble_pop_counts (user_id, pop_count, updated_at)
  values (auth.uid(), 1, now())
  on conflict (user_id)
  do update set
    pop_count = public.user_bubble_pop_counts.pop_count + 1,
    updated_at = now()
  returning pop_count into v_new_count;

  return v_new_count;
end;
$$;

revoke all on function public.increment_user_bubble_pop_count() from public;
grant execute on function public.increment_user_bubble_pop_count() to authenticated;
