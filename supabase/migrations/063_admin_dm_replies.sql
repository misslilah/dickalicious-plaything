-- Allow admin replies in member DM threads (from_admin flag)

alter table public.admin_direct_messages
  add column if not exists from_admin boolean not null default false;

drop policy if exists "admin_direct_messages_insert" on public.admin_direct_messages;
create policy "admin_direct_messages_insert"
  on public.admin_direct_messages for insert to authenticated
  with check (
    (user_id = auth.uid() and from_admin = false)
    or (public.is_admin() and from_admin = true)
  );
