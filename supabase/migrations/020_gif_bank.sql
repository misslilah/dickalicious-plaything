-- Background GIF bank (admin upload, authenticated read).

create table if not exists public.gif_bank (
  id uuid primary key default gen_random_uuid(),
  title text,
  storage_path text not null,
  created_at timestamptz default now()
);

create index if not exists gif_bank_created_at_idx on public.gif_bank (created_at desc);

alter table public.gif_bank enable row level security;

drop policy if exists "gif_bank_select" on public.gif_bank;
create policy "gif_bank_select"
  on public.gif_bank for select to authenticated
  using (true);

drop policy if exists "gif_bank_write" on public.gif_bank;
create policy "gif_bank_write"
  on public.gif_bank for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
