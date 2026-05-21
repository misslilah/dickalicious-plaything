-- Dickalicious Plaything — initial schema (run in Supabase SQL Editor)

-- Profiles (linked to Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Shared catalog
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  color text not null default '#f9a8d4',
  icon text not null default '✨',
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  title text not null,
  description text not null default '',
  min_level int not null default 1 check (min_level between 1 and 5),
  xp_reward int not null default 10,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'once')),
  duration_minutes int,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  cost_points int,
  reward_type text not null default 'shop' check (reward_type in ('shop', 'badge')),
  trigger_type text check (trigger_type in ('streak', 'level')),
  streak_days int,
  level_required int check (level_required between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.punishment_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  trigger_type text not null default 'quota_miss' check (trigger_type in ('quota_miss', 'manual')),
  points_lost int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.video_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text,
  icon text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  video_category_id uuid not null references public.video_categories (id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

-- Per-user progress (game state)
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_xp int not null default 0,
  current_level int not null default 1,
  streak int not null default 0,
  points int not null default 0,
  last_active_date text,
  settings jsonb not null default '{"dailyQuotaPercent":80,"resetHour":4}'::jsonb,
  daily_plans jsonb not null default '{}'::jsonb,
  unlocked_reward_ids jsonb not null default '[]'::jsonb,
  punishments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  urole text;
begin
  uname := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(new.email, '@', 1)
  );
  urole := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'user');
  if urole not in ('user', 'admin') then
    urole := 'user';
  end if;
  insert into public.profiles (id, username, role)
  values (new.id, uname, urole);
  insert into public.user_progress (user_id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check (security definer)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.rewards enable row level security;
alter table public.punishment_templates enable row level security;
alter table public.video_categories enable row level security;
alter table public.videos enable row level security;
alter table public.user_progress enable row level security;

-- Profiles: read own; admins read all; update own username only (role via admin/dashboard)
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Shared catalog: authenticated read; admin write
create policy "categories_select"
  on public.categories for select to authenticated
  using (true);

create policy "categories_write"
  on public.categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "tasks_select"
  on public.tasks for select to authenticated
  using (true);

create policy "tasks_write"
  on public.tasks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "rewards_select"
  on public.rewards for select to authenticated
  using (true);

create policy "rewards_write"
  on public.rewards for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "punishment_templates_select"
  on public.punishment_templates for select to authenticated
  using (true);

create policy "punishment_templates_write"
  on public.punishment_templates for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "video_categories_select"
  on public.video_categories for select to authenticated
  using (true);

create policy "video_categories_write"
  on public.video_categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "videos_select"
  on public.videos for select to authenticated
  using (true);

create policy "videos_write"
  on public.videos for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- User progress: own row only
create policy "user_progress_select_own"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "user_progress_insert_own"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "user_progress_update_own"
  on public.user_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage buckets (create in Dashboard or run below)
-- insert into storage.buckets (id, name, public) values ('videos', 'videos', true);
-- insert into storage.buckets (id, name, public) values ('category-images', 'category-images', true);

-- Storage policies (run after buckets exist)
-- Videos: public read, admin upload/delete
-- create policy "videos_public_read" on storage.objects for select using (bucket_id = 'videos');
-- create policy "videos_admin_write" on storage.objects for all to authenticated
--   using (bucket_id = 'videos' and public.is_admin())
--   with check (bucket_id = 'videos' and public.is_admin());

-- Category images: public read, admin write
-- create policy "cat_images_public_read" on storage.objects for select using (bucket_id = 'category-images');
-- create policy "cat_images_admin_write" on storage.objects for all to authenticated
--   using (bucket_id = 'category-images' and public.is_admin())
--   with check (bucket_id = 'category-images' and public.is_admin());
