-- Idempotent: Flash Cards distraction zones — extra highlight areas per card (admin-only layout).
-- Safe to run multiple times in Supabase SQL Editor.
-- Run after 031_flash_cards_library.sql.
--
-- Distraction zones store their own word and position; they flash during the waiting period
-- and do not affect the three answer choices (which always come from word triplets).

alter table public.flash_word_games
  add column if not exists distraction_zones_enabled boolean not null default false;

create table if not exists public.flash_word_card_distraction_zones (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.flash_word_cards(id) on delete cascade,
  zone_x_pct numeric(5, 2) not null default 10,
  zone_y_pct numeric(5, 2) not null default 70,
  zone_width_pct numeric(5, 2) not null default 15,
  zone_height_pct numeric(5, 2) not null default 8,
  word text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists flash_word_card_distraction_zones_card_id_idx
  on public.flash_word_card_distraction_zones (card_id, sort_order asc, created_at asc);

alter table public.flash_word_card_distraction_zones enable row level security;

drop policy if exists "flash_word_card_distraction_zones_select" on public.flash_word_card_distraction_zones;
create policy "flash_word_card_distraction_zones_select"
  on public.flash_word_card_distraction_zones for select to authenticated
  using (true);

drop policy if exists "flash_word_card_distraction_zones_write" on public.flash_word_card_distraction_zones;
create policy "flash_word_card_distraction_zones_write"
  on public.flash_word_card_distraction_zones for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
