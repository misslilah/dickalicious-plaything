-- Punishment categories (custom grouping; replaces hardcoded Easy/Medium/Hard UI)

create table if not exists public.punishment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.punishment_templates
  add column if not exists punishment_category_id uuid
  references public.punishment_categories (id) on delete set null;

-- Seed default categories when table is empty
insert into public.punishment_categories (name, description, sort_order)
select v.name, v.description, v.sort_order
from (
  values
    ('Easy', 'Light malus relief', 0),
    ('Medium', 'Moderate malus relief', 1),
    ('Hard', 'Heavy malus relief', 2)
) as v (name, description, sort_order)
where not exists (select 1 from public.punishment_categories limit 1);

-- Map legacy difficulty column to seeded categories
update public.punishment_templates pt
set punishment_category_id = pc.id
from public.punishment_categories pc
where pt.punishment_category_id is null
  and pt.difficulty is not null
  and lower(pc.name) = pt.difficulty;

-- RLS
alter table public.punishment_categories enable row level security;

drop policy if exists "punishment_categories_select" on public.punishment_categories;
create policy "punishment_categories_select"
  on public.punishment_categories for select to authenticated
  using (true);

drop policy if exists "punishment_categories_write" on public.punishment_categories;
create policy "punishment_categories_write"
  on public.punishment_categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
