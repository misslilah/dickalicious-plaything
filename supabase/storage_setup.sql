-- Run after 001_initial.sql (Supabase SQL Editor)

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('category-images', 'category-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('badge-images', 'badge-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('gif-bank', 'gif-bank', true)
on conflict (id) do nothing;

-- Public read for all buckets; admin write/delete
create policy "videos_public_read"
  on storage.objects for select
  using (bucket_id = 'videos');

create policy "videos_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'videos' and public.is_admin())
  with check (bucket_id = 'videos' and public.is_admin());

create policy "category_images_public_read"
  on storage.objects for select
  using (bucket_id = 'category-images');

create policy "category_images_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'category-images' and public.is_admin())
  with check (bucket_id = 'category-images' and public.is_admin());

create policy "badge_images_public_read"
  on storage.objects for select
  using (bucket_id = 'badge-images');

create policy "badge_images_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'badge-images' and public.is_admin())
  with check (bucket_id = 'badge-images' and public.is_admin());

create policy "gif_bank_public_read"
  on storage.objects for select
  using (bucket_id = 'gif-bank');

create policy "gif_bank_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'gif-bank' and public.is_admin())
  with check (bucket_id = 'gif-bank' and public.is_admin());

insert into storage.buckets (id, name, public)
values ('audio-playlist', 'audio-playlist', true)
on conflict (id) do nothing;

create policy "audio_playlist_public_read"
  on storage.objects for select
  using (bucket_id = 'audio-playlist');

create policy "audio_playlist_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'audio-playlist' and public.is_admin())
  with check (bucket_id = 'audio-playlist' and public.is_admin());

insert into storage.buckets (id, name, public)
values ('flash-game-images', 'flash-game-images', true)
on conflict (id) do nothing;

create policy "flash_game_images_public_read"
  on storage.objects for select
  using (bucket_id = 'flash-game-images');

create policy "flash_game_images_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'flash-game-images' and public.is_admin())
  with check (bucket_id = 'flash-game-images' and public.is_admin());
