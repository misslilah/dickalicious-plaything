-- Idempotent: Flash Word mini games + storage bucket.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- After running: create games in the app (Admin → Mini games).
-- Upload an image, drag the flash zone, add word combinations (run 029 for triplet columns).
-- No seed data — games are created through the admin editor.

create table if not exists public.flash_word_games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_path text not null,
  flash_duration_ms integer not null default 200,
  zone_x_pct numeric(5, 2) not null default 40,
  zone_y_pct numeric(5, 2) not null default 45,
  zone_width_pct numeric(5, 2) not null default 20,
  zone_height_pct numeric(5, 2) not null default 10,
  created_at timestamptz default now()
);

create table if not exists public.flash_word_game_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.flash_word_games(id) on delete cascade,
  correct_word text not null,
  distractor_1 text not null,
  distractor_2 text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists flash_word_game_rounds_game_id_idx
  on public.flash_word_game_rounds (game_id, sort_order asc, created_at asc);

alter table public.flash_word_games enable row level security;
alter table public.flash_word_game_rounds enable row level security;

drop policy if exists "flash_word_games_select" on public.flash_word_games;
create policy "flash_word_games_select"
  on public.flash_word_games for select to authenticated
  using (true);

drop policy if exists "flash_word_games_write" on public.flash_word_games;
create policy "flash_word_games_write"
  on public.flash_word_games for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "flash_word_game_rounds_select" on public.flash_word_game_rounds;
create policy "flash_word_game_rounds_select"
  on public.flash_word_game_rounds for select to authenticated
  using (true);

drop policy if exists "flash_word_game_rounds_write" on public.flash_word_game_rounds;
create policy "flash_word_game_rounds_write"
  on public.flash_word_game_rounds for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('flash-game-images', 'flash-game-images', true)
on conflict (id) do nothing;

drop policy if exists "flash_game_images_public_read" on storage.objects;
create policy "flash_game_images_public_read"
  on storage.objects for select
  using (bucket_id = 'flash-game-images');

drop policy if exists "flash_game_images_admin_write" on storage.objects;
create policy "flash_game_images_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'flash-game-images' and public.is_admin())
  with check (bucket_id = 'flash-game-images' and public.is_admin());
