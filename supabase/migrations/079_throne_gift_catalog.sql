-- Persistent Throne gift catalog for admin punishment setup (works when scraping is rate-limited).

create table if not exists public.throne_gift_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price_cents int not null check (price_cents > 0),
  currency text not null default 'EUR',
  url text not null,
  throne_gift_id text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists throne_gift_catalog_sort_order_idx
  on public.throne_gift_catalog (sort_order, price_cents, title);

create unique index if not exists throne_gift_catalog_throne_gift_id_uidx
  on public.throne_gift_catalog (throne_gift_id)
  where throne_gift_id is not null;

comment on table public.throne_gift_catalog is
  'Admin-maintained Throne gift list for punishment templates; survives Throne scrape rate limits.';

alter table public.throne_gift_catalog enable row level security;

drop policy if exists "throne_gift_catalog_select_admin" on public.throne_gift_catalog;
create policy "throne_gift_catalog_select_admin"
  on public.throne_gift_catalog for select to authenticated
  using (public.is_admin());

drop policy if exists "throne_gift_catalog_admin_all" on public.throne_gift_catalog;
create policy "throne_gift_catalog_admin_all"
  on public.throne_gift_catalog for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
