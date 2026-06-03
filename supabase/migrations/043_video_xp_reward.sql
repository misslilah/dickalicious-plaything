-- Idempotent: XP reward on catalog video completion (once per user per video).
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.videos
  add column if not exists xp_reward integer not null default 0;

comment on column public.videos.xp_reward is
  'XP granted when the user watches the full video once (0 = none).';

create table if not exists public.user_video_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  xp_awarded integer not null default 0,
  completed_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists user_video_completions_user_id_idx
  on public.user_video_completions (user_id);

alter table public.user_video_completions enable row level security;

drop policy if exists "user_video_completions_select" on public.user_video_completions;
create policy "user_video_completions_select"
  on public.user_video_completions for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_video_completions_insert_own" on public.user_video_completions;
create policy "user_video_completions_insert_own"
  on public.user_video_completions for insert to authenticated
  with check (auth.uid() = user_id);
