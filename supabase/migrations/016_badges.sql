-- Profile badges (image catalog) separate from shop/auto rewards.

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_url text,
  is_secret boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists badges_sort_order_idx on public.badges (sort_order, created_at);
create index if not exists user_badges_user_id_idx on public.user_badges (user_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "badges_select" on public.badges;
create policy "badges_select"
  on public.badges for select to authenticated
  using (true);

drop policy if exists "badges_write" on public.badges;
create policy "badges_write"
  on public.badges for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "user_badges_select" on public.user_badges;
create policy "user_badges_select"
  on public.user_badges for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_badges_insert_own" on public.user_badges;
create policy "user_badges_insert_own"
  on public.user_badges for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_badges_admin_write" on public.user_badges;
create policy "user_badges_admin_write"
  on public.user_badges for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Storage: create public bucket `badge-images` in Supabase dashboard.
-- Suggested policy (mirror category-images):
-- create policy "badge_images_select" on storage.objects for select using (bucket_id = 'badge-images');
-- create policy "badge_images_admin_write" on storage.objects for all to authenticated
--   using (bucket_id = 'badge-images' and public.is_admin())
--   with check (bucket_id = 'badge-images' and public.is_admin());
