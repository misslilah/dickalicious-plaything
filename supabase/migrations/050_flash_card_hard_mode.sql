-- Idempotent: Flash Cards hard mode — extra highlight zones and distraction zones per card (JSON).
-- Safe to run multiple times in Supabase SQL Editor.
-- Run after 032_flash_card_distraction_zones.sql.
--
-- Hard mode activates in-game when the player streak reaches 20+.
-- hard_zones: array of { xPct, yPct, widthPct, heightPct }
-- hard_distraction_zones: array of { id?, zone: { xPct, yPct, widthPct, heightPct }, word }

alter table public.flash_word_cards
  add column if not exists hard_zones jsonb not null default '[]'::jsonb;

alter table public.flash_word_cards
  add column if not exists hard_distraction_zones jsonb not null default '[]'::jsonb;

comment on column public.flash_word_cards.hard_zones is
  'Extra highlight zones (percent rects) shown during hard mode (streak >= 20).';

comment on column public.flash_word_cards.hard_distraction_zones is
  'Extra distraction zones with words; flash more often during hard mode.';
