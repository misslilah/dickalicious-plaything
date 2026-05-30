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
