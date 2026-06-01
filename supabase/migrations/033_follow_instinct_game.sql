-- Idempotent: Follow your instinct mini-game + storage bucket.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- After running: create a game in the app (Admin → Mini games → Follow your instinct).
-- Upload left and right panel images. Players use the device camera during play.

create table if not exists public.follow_instinct_games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  left_image_path text not null,
  right_image_path text not null,
  created_at timestamptz default now()
);

create index if not exists follow_instinct_games_created_at_idx
  on public.follow_instinct_games (created_at desc);

alter table public.follow_instinct_games enable row level security;

drop policy if exists "follow_instinct_games_select" on public.follow_instinct_games;
create policy "follow_instinct_games_select"
  on public.follow_instinct_games for select to authenticated
  using (true);

drop policy if exists "follow_instinct_games_write" on public.follow_instinct_games;
create policy "follow_instinct_games_write"
  on public.follow_instinct_games for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('follow-instinct-images', 'follow-instinct-images', true)
on conflict (id) do nothing;

drop policy if exists "follow_instinct_images_public_read" on storage.objects;
create policy "follow_instinct_images_public_read"
  on storage.objects for select
  using (bucket_id = 'follow-instinct-images');

drop policy if exists "follow_instinct_images_admin_write" on storage.objects;
create policy "follow_instinct_images_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'follow-instinct-images' and public.is_admin())
  with check (bucket_id = 'follow-instinct-images' and public.is_admin());
