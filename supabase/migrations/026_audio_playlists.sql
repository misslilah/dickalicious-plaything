-- Multiple audio playlists with optional unlock prerequisites.

create table if not exists public.audio_playlists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  sort_order integer not null default 0,
  unlock_after_playlist_id uuid references public.audio_playlists(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists audio_playlists_sort_order_idx
  on public.audio_playlists (sort_order asc, created_at asc);

alter table public.audio_playlists enable row level security;

drop policy if exists "audio_playlists_select" on public.audio_playlists;
create policy "audio_playlists_select"
  on public.audio_playlists for select to authenticated
  using (true);

drop policy if exists "audio_playlists_write" on public.audio_playlists;
create policy "audio_playlists_write"
  on public.audio_playlists for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.audio_playlist_items
  add column if not exists playlist_id uuid references public.audio_playlists(id) on delete cascade;

-- Move orphan tracks into a default playlist (one-time migration).
do $$
declare
  default_id uuid;
begin
  if exists (
    select 1 from public.audio_playlist_items where playlist_id is null limit 1
  ) then
    insert into public.audio_playlists (title, sort_order)
    values ('Main playlist', 0)
    returning id into default_id;

    update public.audio_playlist_items
    set playlist_id = default_id
    where playlist_id is null;
  end if;
end $$;

alter table public.audio_playlist_items
  alter column playlist_id set not null;

create index if not exists audio_playlist_items_playlist_id_idx
  on public.audio_playlist_items (playlist_id, sort_order asc, created_at asc);
