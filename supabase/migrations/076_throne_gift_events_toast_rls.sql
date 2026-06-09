-- Migration 074 restricted throne_gift_events SELECT to admins only, which blocks
-- realtime INSERT notifications for regular logged-in users. Restore read access
-- for all authenticated users (toasts); writes remain service-role only.

drop policy if exists "throne_gift_events_select_admin" on public.throne_gift_events;

drop policy if exists "throne_gift_events_select_authenticated" on public.throne_gift_events;
create policy "throne_gift_events_select_authenticated"
  on public.throne_gift_events for select to authenticated
  using (true);
