-- Idempotent: badge-images storage bucket (public read, admin write).
-- Safe to run multiple times in Supabase SQL Editor.
-- Required for Admin → Profile badges image uploads.

insert into storage.buckets (id, name, public)
values ('badge-images', 'badge-images', true)
on conflict (id) do nothing;

drop policy if exists "badge_images_public_read" on storage.objects;
create policy "badge_images_public_read"
  on storage.objects for select
  using (bucket_id = 'badge-images');

drop policy if exists "badge_images_admin_write" on storage.objects;
create policy "badge_images_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'badge-images' and public.is_admin())
  with check (bucket_id = 'badge-images' and public.is_admin());
