-- Sequential audio playlist (admin upload, authenticated read).

create table if not exists public.audio_playlist_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  sort_order integer not null default 0,
  duration_seconds numeric,
  created_at timestamptz default now()
);

create index if not exists audio_playlist_items_sort_order_idx
  on public.audio_playlist_items (sort_order asc, created_at asc);

alter table public.audio_playlist_items enable row level security;

drop policy if exists "audio_playlist_select" on public.audio_playlist_items;
create policy "audio_playlist_select"
  on public.audio_playlist_items for select to authenticated
  using (true);

drop policy if exists "audio_playlist_write" on public.audio_playlist_items;
create policy "audio_playlist_write"
  on public.audio_playlist_items for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Storage bucket (public read, admin write).
insert into storage.buckets (id, name, public)
values ('audio-playlist', 'audio-playlist', true)
on conflict (id) do nothing;

drop policy if exists "audio_playlist_public_read" on storage.objects;
create policy "audio_playlist_public_read"
  on storage.objects for select
  using (bucket_id = 'audio-playlist');

drop policy if exists "audio_playlist_admin_write" on storage.objects;
create policy "audio_playlist_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'audio-playlist' and public.is_admin())
  with check (bucket_id = 'audio-playlist' and public.is_admin());
