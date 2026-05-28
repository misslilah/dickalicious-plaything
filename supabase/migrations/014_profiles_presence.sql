-- Profile presence (online users) and signup role hardening

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_at_idx
  on public.profiles (last_seen_at desc)
  where last_seen_at is not null;

-- New signups are always regular users; promote to admin only in Supabase dashboard.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, username, role)
  values (new.id, uname, 'user');
  insert into public.user_progress (user_id)
  values (new.id);
  return new;
end;
$$;

drop policy if exists "profiles_select_presence" on public.profiles;
create policy "profiles_select_presence"
  on public.profiles for select to authenticated
  using (
    last_seen_at is not null
    and last_seen_at > now() - interval '2 minutes'
  );
