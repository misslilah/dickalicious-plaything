-- PostgREST needs a direct FK to public.profiles for profiles(...) embeds.
-- Migration 073 referenced auth.users; profiles.id is the same UUID but not in schema cache.

alter table public.throne_payment_pending
  drop constraint if exists throne_payment_pending_user_id_fkey;

alter table public.throne_payment_pending
  add constraint throne_payment_pending_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.throne_gift_events
  drop constraint if exists throne_gift_events_matched_user_id_fkey;

alter table public.throne_gift_events
  add constraint throne_gift_events_matched_user_id_fkey
  foreign key (matched_user_id) references public.profiles (id) on delete set null;
