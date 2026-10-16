-- University themes (grandes catégories): link the same subject across levels.
-- A category belongs to at most one theme. Class membership stays on categories.class_id.

create table if not exists public.university_families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  icon text not null default '📚',
  color text not null default '#c084fc',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories
  add column if not exists family_id uuid
  references public.university_families (id) on delete set null;

create index if not exists categories_family_id_idx
  on public.categories (family_id);

alter table public.university_families enable row level security;

drop policy if exists "university_families_select" on public.university_families;
create policy "university_families_select"
  on public.university_families for select to authenticated
  using (true);

drop policy if exists "university_families_write" on public.university_families;
create policy "university_families_write"
  on public.university_families for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
