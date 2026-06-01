-- Idempotent: Flash Cards library — multiple images per game, each with its own zone.
-- Safe to run multiple times in Supabase SQL Editor.
-- Run after 028_flash_word_games.sql, 029_flash_word_triplets.sql, and 030_flash_word_saved_combinations.sql.
--
-- Migrates existing single-image games into one row in flash_word_cards.
-- Deprecates image/zone columns on flash_word_games (kept nullable for compatibility).

create table if not exists public.flash_word_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.flash_word_games(id) on delete cascade,
  image_path text not null,
  zone_x_pct numeric(5, 2) not null default 40,
  zone_y_pct numeric(5, 2) not null default 45,
  zone_width_pct numeric(5, 2) not null default 20,
  zone_height_pct numeric(5, 2) not null default 10,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists flash_word_cards_game_id_idx
  on public.flash_word_cards (game_id, sort_order asc, created_at asc);

-- Move legacy single image + zone into one card per game (skip if already migrated).
insert into public.flash_word_cards (
  game_id,
  image_path,
  zone_x_pct,
  zone_y_pct,
  zone_width_pct,
  zone_height_pct,
  sort_order
)
select
  g.id,
  g.image_path,
  g.zone_x_pct,
  g.zone_y_pct,
  g.zone_width_pct,
  g.zone_height_pct,
  0
from public.flash_word_games g
where g.image_path is not null
  and trim(g.image_path) <> ''
  and not exists (
    select 1
    from public.flash_word_cards c
    where c.game_id = g.id
  );

-- New games store cards in flash_word_cards; legacy columns are optional.
alter table public.flash_word_games alter column image_path drop not null;

alter table public.flash_word_cards enable row level security;

drop policy if exists "flash_word_cards_select" on public.flash_word_cards;
create policy "flash_word_cards_select"
  on public.flash_word_cards for select to authenticated
  using (true);

drop policy if exists "flash_word_cards_write" on public.flash_word_cards;
create policy "flash_word_cards_write"
  on public.flash_word_cards for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
