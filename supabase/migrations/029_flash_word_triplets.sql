-- Idempotent: Flash Word rounds → equal word triplets (word_1, word_2, word_3).
-- Safe to run multiple times in Supabase SQL Editor.
-- Run after 028_flash_word_games.sql.
--
-- Migrates existing rows: word_1 = correct_word, word_2 = distractor_1, word_3 = distractor_2.

alter table public.flash_word_game_rounds add column if not exists word_1 text;
alter table public.flash_word_game_rounds add column if not exists word_2 text;
alter table public.flash_word_game_rounds add column if not exists word_3 text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'flash_word_game_rounds'
      and column_name = 'correct_word'
  ) then
    update public.flash_word_game_rounds
    set
      word_1 = coalesce(nullif(trim(word_1), ''), correct_word),
      word_2 = coalesce(nullif(trim(word_2), ''), distractor_1),
      word_3 = coalesce(nullif(trim(word_3), ''), distractor_2);

    alter table public.flash_word_game_rounds drop column correct_word;
    alter table public.flash_word_game_rounds drop column distractor_1;
    alter table public.flash_word_game_rounds drop column distractor_2;
  end if;
end $$;

alter table public.flash_word_game_rounds alter column word_1 set not null;
alter table public.flash_word_game_rounds alter column word_2 set not null;
alter table public.flash_word_game_rounds alter column word_3 set not null;
