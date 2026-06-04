-- User-owned video playlists (normal + interactive), sequential playback in app.

create table if not exists public.video_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  type text not null check (type in ('normal', 'interactive')),
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    alter table public.video_playlists
      drop constraint if exists video_playlists_user_id_profiles_fkey;
    alter table public.video_playlists
      add constraint video_playlists_user_id_profiles_fkey
      foreign key (user_id) references public.profiles (id) on delete cascade;
  end if;
exception
  when duplicate_object then null;
end $$;

create index if not exists video_playlists_user_type_idx
  on public.video_playlists (user_id, type, sort_order asc, created_at asc);

alter table public.video_playlists enable row level security;

drop policy if exists "video_playlists_select" on public.video_playlists;
create policy "video_playlists_select"
  on public.video_playlists for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "video_playlists_insert" on public.video_playlists;
create policy "video_playlists_insert"
  on public.video_playlists for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "video_playlists_update" on public.video_playlists;
create policy "video_playlists_update"
  on public.video_playlists for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "video_playlists_delete" on public.video_playlists;
create policy "video_playlists_delete"
  on public.video_playlists for delete to authenticated
  using (auth.uid() = user_id);

create table if not exists public.video_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.video_playlists (id) on delete cascade,
  video_id uuid not null,
  position integer not null default 0,
  created_at timestamptz default now(),
  unique (playlist_id, video_id)
);

create index if not exists video_playlist_items_playlist_idx
  on public.video_playlist_items (playlist_id, position asc, created_at asc);

alter table public.video_playlist_items enable row level security;

drop policy if exists "video_playlist_items_select" on public.video_playlist_items;
create policy "video_playlist_items_select"
  on public.video_playlist_items for select to authenticated
  using (
    exists (
      select 1 from public.video_playlists vp
      where vp.id = playlist_id and vp.user_id = auth.uid()
    )
  );

drop policy if exists "video_playlist_items_insert" on public.video_playlist_items;
create policy "video_playlist_items_insert"
  on public.video_playlist_items for insert to authenticated
  with check (
    exists (
      select 1 from public.video_playlists vp
      where vp.id = playlist_id and vp.user_id = auth.uid()
    )
  );

drop policy if exists "video_playlist_items_update" on public.video_playlist_items;
create policy "video_playlist_items_update"
  on public.video_playlist_items for update to authenticated
  using (
    exists (
      select 1 from public.video_playlists vp
      where vp.id = playlist_id and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.video_playlists vp
      where vp.id = playlist_id and vp.user_id = auth.uid()
    )
  );

drop policy if exists "video_playlist_items_delete" on public.video_playlist_items;
create policy "video_playlist_items_delete"
  on public.video_playlist_items for delete to authenticated
  using (
    exists (
      select 1 from public.video_playlists vp
      where vp.id = playlist_id and vp.user_id = auth.uid()
    )
  );
