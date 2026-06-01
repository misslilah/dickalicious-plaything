-- Idempotent: admin-level reusable Flash Word combination library.
-- Safe to run multiple times in Supabase SQL Editor.
-- Run after 028_flash_word_games.sql and 029_flash_word_triplets.sql.

create table if not exists public.flash_word_saved_combinations (
  id uuid primary key default gen_random_uuid(),
  word_1 text not null,
  word_2 text not null,
  word_3 text not null,
  created_at timestamptz default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists flash_word_saved_combinations_created_at_idx
  on public.flash_word_saved_combinations (created_at desc);

create unique index if not exists flash_word_saved_combinations_words_uidx
  on public.flash_word_saved_combinations (
    lower(trim(word_1)),
    lower(trim(word_2)),
    lower(trim(word_3))
  );

alter table public.flash_word_saved_combinations enable row level security;

drop policy if exists "flash_word_saved_combinations_admin" on public.flash_word_saved_combinations;
create policy "flash_word_saved_combinations_admin"
  on public.flash_word_saved_combinations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
