-- Ensure Throne gift events are visible in Admin + Realtime toasts.
-- Safe to re-run: only adds publication / policies when missing.

alter table public.throne_gift_events replica identity full;

drop policy if exists "throne_gift_events_select_admin" on public.throne_gift_events;
create policy "throne_gift_events_select_admin"
  on public.throne_gift_events for select to authenticated
  using (public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'throne_gift_events'
    ) then
      alter publication supabase_realtime add table public.throne_gift_events;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'throne_payment_pending'
    ) then
      alter publication supabase_realtime add table public.throne_payment_pending;
    end if;
  end if;
end;
$$;
