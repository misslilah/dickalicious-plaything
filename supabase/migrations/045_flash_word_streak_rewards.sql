-- Idempotent: Focus Training (Flash Cards) streak reward tiers + audio bucket.
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.flash_word_game_streak_tiers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.flash_word_games (id) on delete cascade,
  streak_threshold integer not null check (streak_threshold >= 1),
  xp_reward integer not null default 0 check (xp_reward >= 0),
  message text,
  audio_storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, streak_threshold)
);

create index if not exists flash_word_game_streak_tiers_game_id_idx
  on public.flash_word_game_streak_tiers (game_id, sort_order asc, streak_threshold asc);

comment on table public.flash_word_game_streak_tiers is
  'Per-game streak milestones: XP, optional message, optional audio clip.';

alter table public.flash_word_game_streak_tiers enable row level security;

drop policy if exists "flash_word_game_streak_tiers_select" on public.flash_word_game_streak_tiers;
create policy "flash_word_game_streak_tiers_select"
  on public.flash_word_game_streak_tiers for select to authenticated
  using (true);

drop policy if exists "flash_word_game_streak_tiers_write" on public.flash_word_game_streak_tiers;
create policy "flash_word_game_streak_tiers_write"
  on public.flash_word_game_streak_tiers for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('flash-game-audio', 'flash-game-audio', true)
on conflict (id) do nothing;

drop policy if exists "flash_game_audio_public_read" on storage.objects;
create policy "flash_game_audio_public_read"
  on storage.objects for select
  using (bucket_id = 'flash-game-audio');

drop policy if exists "flash_game_audio_admin_write" on storage.objects;
create policy "flash_game_audio_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'flash-game-audio' and public.is_admin())
  with check (bucket_id = 'flash-game-audio' and public.is_admin());
