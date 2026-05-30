-- Shared timing for random background GIF appearances (admin-configurable).

create table if not exists public.gif_bank_settings (
  id integer primary key default 1 check (id = 1),
  min_interval_ms integer not null default 300000
    check (min_interval_ms >= 1000 and min_interval_ms <= 3600000),
  max_interval_ms integer not null default 600000
    check (max_interval_ms >= 1000 and max_interval_ms <= 3600000),
  updated_at timestamptz default now(),
  constraint gif_bank_settings_min_lte_max check (min_interval_ms <= max_interval_ms)
);

insert into public.gif_bank_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.gif_bank_settings enable row level security;

drop policy if exists "gif_bank_settings_select" on public.gif_bank_settings;
create policy "gif_bank_settings_select"
  on public.gif_bank_settings for select to authenticated
  using (true);

drop policy if exists "gif_bank_settings_write" on public.gif_bank_settings;
create policy "gif_bank_settings_write"
  on public.gif_bank_settings for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
