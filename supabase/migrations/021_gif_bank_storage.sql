-- Idempotent: gif-bank storage bucket (public read, admin write).
-- Safe to run multiple times in Supabase SQL Editor.
-- Required for Admin → GIF bank uploads.

insert into storage.buckets (id, name, public)
values ('gif-bank', 'gif-bank', true)
on conflict (id) do nothing;

drop policy if exists "gif_bank_public_read" on storage.objects;
create policy "gif_bank_public_read"
  on storage.objects for select
  using (bucket_id = 'gif-bank');

drop policy if exists "gif_bank_admin_write" on storage.objects;
create policy "gif_bank_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'gif-bank' and public.is_admin())
  with check (bucket_id = 'gif-bank' and public.is_admin());
