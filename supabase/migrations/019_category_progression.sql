-- Category tier groups, unlock chains, and per-user category completion

alter table public.categories
  add column if not exists category_group text
  check (category_group in ('all', 'beginner', 'intermediate', 'trained', 'mindless'))
  default 'beginner';

alter table public.categories
  add column if not exists unlock_after_category_id uuid
  references public.categories (id) on delete set null;

alter table public.category_members
  add column if not exists tasks_completed_count int not null default 0;

alter table public.category_members
  add column if not exists marked_complete_at timestamptz null;

create index if not exists categories_category_group_idx
  on public.categories (category_group);

create index if not exists categories_unlock_after_idx
  on public.categories (unlock_after_category_id);
