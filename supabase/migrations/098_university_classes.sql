-- University classes: a class groups many categories (each category is in at most one class).

create table if not exists public.university_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  icon text not null default '🎓',
  color text not null default '#c084fc',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories
  add column if not exists class_id uuid
  references public.university_classes (id) on delete set null;

create index if not exists categories_class_id_idx
  on public.categories (class_id);

alter table public.university_classes enable row level security;

drop policy if exists "university_classes_select" on public.university_classes;
create policy "university_classes_select"
  on public.university_classes for select to authenticated
  using (true);

drop policy if exists "university_classes_write" on public.university_classes;
create policy "university_classes_write"
  on public.university_classes for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
