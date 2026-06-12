-- Idempotent: Flash Cards hard mode overlay images per card (JSON).
-- Safe to run multiple times in Supabase SQL Editor.
-- Run after 050_flash_card_hard_mode.sql.
--
-- hard_mode_images: array of { id, imagePath, zone: { xPct, yPct, widthPct, heightPct }, displayMode?: 'persistent' | 'pop' }
-- displayMode defaults to 'persistent' when omitted (handled in app parse).
-- Images are stored in flash-game-images bucket; shown during hard mode (streak >= 20).

alter table public.flash_word_cards
  add column if not exists hard_mode_images jsonb not null default '[]'::jsonb;

comment on column public.flash_word_cards.hard_mode_images is
  'Overlay images (percent rects + storage paths) shown during hard mode (streak >= 20).';
