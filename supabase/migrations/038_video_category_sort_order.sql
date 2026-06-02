-- Video category display order (idempotent; column exists from 001_initial).

alter table public.video_categories
  add column if not exists sort_order int not null default 0;

create index if not exists video_categories_sort_order_idx
  on public.video_categories (sort_order asc, created_at asc);

-- Backfill when every row still has the default (0): assign stable order by created_at.
update public.video_categories vc
set sort_order = sub.rn
from (
  select
    id,
    (row_number() over (order by created_at asc) - 1)::int as rn
  from public.video_categories
) sub
where vc.id = sub.id
  and not exists (
    select 1 from public.video_categories where sort_order <> 0
  );
