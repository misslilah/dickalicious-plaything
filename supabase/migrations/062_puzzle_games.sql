-- Idempotent: Puzzle mini games + storage bucket.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- After running: create puzzles in the app (Admin → Mini games → Puzzle).
-- Upload an image, choose piece count and rotation direction.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'puzzle_rotation_direction') then
    create type public.puzzle_rotation_direction as enum (
      'clockwise',
      'counterclockwise',
      'none'
    );
  end if;
end $$;

create table if not exists public.puzzle_games (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_path text not null,
  piece_count integer not null default 9
    check (piece_count in (4, 9, 16, 25, 36)),
  rotation_direction public.puzzle_rotation_direction not null default 'clockwise',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists puzzle_games_sort_order_idx
  on public.puzzle_games (sort_order asc, created_at desc);

create index if not exists puzzle_games_active_idx
  on public.puzzle_games (is_active, sort_order asc);

alter table public.puzzle_games enable row level security;

drop policy if exists "puzzle_games_select" on public.puzzle_games;
create policy "puzzle_games_select"
  on public.puzzle_games for select to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "puzzle_games_write" on public.puzzle_games;
create policy "puzzle_games_write"
  on public.puzzle_games for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('puzzle-game-images', 'puzzle-game-images', true)
on conflict (id) do nothing;

drop policy if exists "puzzle_game_images_public_read" on storage.objects;
create policy "puzzle_game_images_public_read"
  on storage.objects for select
  using (bucket_id = 'puzzle-game-images');

drop policy if exists "puzzle_game_images_admin_write" on storage.objects;
create policy "puzzle_game_images_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'puzzle-game-images' and public.is_admin())
  with check (bucket_id = 'puzzle-game-images' and public.is_admin());
