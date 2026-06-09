-- Training tasks, blackmail opt-in, proof photo completions, and storage buckets.

-- —— Profile blackmail opt-in ——
alter table public.profiles
  add column if not exists training_blackmail_enabled boolean not null default false,
  add column if not exists training_blackmail_consented_at timestamptz;

comment on column public.profiles.training_blackmail_enabled is
  'User opted in to fictional blackmail roleplay training (Slut tier).';
comment on column public.profiles.training_blackmail_consented_at is
  'When the user accepted the blackmail certificate.';

-- —— Training tasks (global list for Slut training users) ——
create table if not exists public.training_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  sort_order int not null default 0,
  video_path text,
  required_phrase text,
  required_phrase_repeat_count int not null default 1
    check (required_phrase_repeat_count >= 1),
  timer_seconds int check (timer_seconds is null or timer_seconds > 0),
  open_url text,
  requires_proof_photo boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists training_tasks_sort_order_idx
  on public.training_tasks (sort_order, created_at);

-- —— Per-user completions + proof verification ——
create table if not exists public.training_task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.training_tasks (id) on delete cascade,
  completed_at timestamptz not null default now(),
  proof_photo_path text,
  proof_status text check (
    proof_status is null
    or proof_status in ('pending', 'approved', 'rejected')
  ),
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  unique (user_id, task_id)
);

create index if not exists training_task_completions_user_idx
  on public.training_task_completions (user_id);
create index if not exists training_task_completions_proof_pending_idx
  on public.training_task_completions (proof_status)
  where proof_status = 'pending';

alter table public.training_tasks enable row level security;
alter table public.training_task_completions enable row level security;

-- training_tasks: active tasks readable by authenticated users; admin full access
drop policy if exists "training_tasks_select_active" on public.training_tasks;
create policy "training_tasks_select_active"
  on public.training_tasks for select to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "training_tasks_admin_all" on public.training_tasks;
create policy "training_tasks_admin_all"
  on public.training_tasks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- completions: users read/insert own; admin read/update all
drop policy if exists "training_completions_select_own" on public.training_task_completions;
create policy "training_completions_select_own"
  on public.training_task_completions for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "training_completions_insert_own" on public.training_task_completions;
create policy "training_completions_insert_own"
  on public.training_task_completions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "training_completions_update_own" on public.training_task_completions;
create policy "training_completions_update_own"
  on public.training_task_completions for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- —— Storage: training videos (private; admin write, authenticated read) ——
insert into storage.buckets (id, name, public)
values ('training-videos', 'training-videos', false)
on conflict (id) do nothing;

drop policy if exists "training_videos_admin_write" on storage.objects;
create policy "training_videos_admin_write"
  on storage.objects for all to authenticated
  using (bucket_id = 'training-videos' and public.is_admin())
  with check (bucket_id = 'training-videos' and public.is_admin());

drop policy if exists "training_videos_authenticated_read" on storage.objects;
create policy "training_videos_authenticated_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'training-videos');

-- —— Storage: proof photos (private; user folder write, admin read all) ——
insert into storage.buckets (id, name, public)
values ('training-proof-photos', 'training-proof-photos', false)
on conflict (id) do nothing;

drop policy if exists "training_proof_photos_user_insert" on storage.objects;
create policy "training_proof_photos_user_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'training-proof-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "training_proof_photos_user_select_own" on storage.objects;
create policy "training_proof_photos_user_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'training-proof-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "training_proof_photos_user_update_own" on storage.objects;
create policy "training_proof_photos_user_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'training-proof-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'training-proof-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "training_proof_photos_admin_delete" on storage.objects;
create policy "training_proof_photos_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'training-proof-photos' and public.is_admin());
