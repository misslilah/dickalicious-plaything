-- Badge display order (idempotent; column exists from 016_badges).

alter table public.badges
  add column if not exists sort_order int not null default 0;

create index if not exists badges_sort_order_idx
  on public.badges (sort_order asc, created_at asc);

-- Backfill when every row still has the default (0): assign stable order by created_at.
update public.badges b
set sort_order = sub.rn
from (
  select
    id,
    (row_number() over (order by created_at asc) - 1)::int as rn
  from public.badges
) sub
where b.id = sub.id
  and not exists (
    select 1 from public.badges where sort_order <> 0
  );
