-- Throne gift webhook events, payment pending queue, and training task flag.

alter table public.training_tasks
  add column if not exists throne_payment boolean not null default false;

comment on column public.training_tasks.throne_payment is
  'When true, task completes automatically after a Throne gift webhook matches a pending payment.';

-- Incoming gift events (inserted by throne-webhook edge function).
create table if not exists public.throne_gift_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event_type text not null default 'gift',
  gifter_name text,
  item_name text,
  amount_cents int,
  currency text,
  payload jsonb not null default '{}'::jsonb,
  matched_user_id uuid references auth.users (id) on delete set null,
  matched_task_id uuid references public.training_tasks (id) on delete set null,
  matched_pending_id uuid
);

create index if not exists throne_gift_events_received_idx
  on public.throne_gift_events (received_at desc);

-- User clicked "I completed payment" and is waiting for webhook or admin confirmation.
create table if not exists public.throne_payment_pending (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.training_tasks (id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'completed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  completed_at timestamptz,
  gift_event_id uuid references public.throne_gift_events (id) on delete set null
);

create index if not exists throne_payment_pending_waiting_idx
  on public.throne_payment_pending (created_at)
  where status = 'waiting';

create unique index if not exists throne_payment_pending_user_task_waiting_idx
  on public.throne_payment_pending (user_id, task_id)
  where status = 'waiting';

alter table public.throne_gift_events
  add constraint throne_gift_events_matched_pending_fkey
  foreign key (matched_pending_id) references public.throne_payment_pending (id) on delete set null;

alter table public.throne_gift_events enable row level security;
alter table public.throne_payment_pending enable row level security;

-- Gift events: readable by authenticated users (realtime toasts); writes via service role only.
drop policy if exists "throne_gift_events_select_authenticated" on public.throne_gift_events;
create policy "throne_gift_events_select_authenticated"
  on public.throne_gift_events for select to authenticated
  using (true);

-- Pending: users manage own; admin sees all.
drop policy if exists "throne_payment_pending_select_own" on public.throne_payment_pending;
create policy "throne_payment_pending_select_own"
  on public.throne_payment_pending for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "throne_payment_pending_insert_own" on public.throne_payment_pending;
create policy "throne_payment_pending_insert_own"
  on public.throne_payment_pending for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "throne_payment_pending_update_own_waiting" on public.throne_payment_pending;
create policy "throne_payment_pending_update_own_waiting"
  on public.throne_payment_pending for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- Complete a pending Throne payment and mark the training task done.
create or replace function public.complete_throne_payment_pending(
  p_pending_id uuid,
  p_gift_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending public.throne_payment_pending%rowtype;
begin
  select *
  into v_pending
  from public.throne_payment_pending
  where id = p_pending_id
    and status = 'waiting'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'pending_not_found');
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_pending.user_id
     and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if exists (
    select 1
    from public.training_task_completions
    where user_id = v_pending.user_id
      and task_id = v_pending.task_id
  ) then
    update public.throne_payment_pending
    set status = 'cancelled'
    where id = p_pending_id;
    return jsonb_build_object('ok', false, 'error', 'already_completed');
  end if;

  insert into public.training_task_completions (user_id, task_id)
  values (v_pending.user_id, v_pending.task_id);

  update public.throne_payment_pending
  set
    status = 'completed',
    completed_at = now(),
    gift_event_id = p_gift_event_id
  where id = p_pending_id;

  if p_gift_event_id is not null then
    update public.throne_gift_events
    set
      matched_user_id = v_pending.user_id,
      matched_task_id = v_pending.task_id,
      matched_pending_id = p_pending_id
    where id = p_gift_event_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_pending.user_id,
    'task_id', v_pending.task_id
  );
end;
$$;

revoke all on function public.complete_throne_payment_pending(uuid, uuid) from public;
grant execute on function public.complete_throne_payment_pending(uuid, uuid) to authenticated;
grant execute on function public.complete_throne_payment_pending(uuid, uuid) to service_role;

-- Match the oldest waiting pending payment to a new gift event (FIFO).
create or replace function public.match_throne_gift_to_pending(p_gift_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_id uuid;
  v_result jsonb;
begin
  select id
  into v_pending_id
  from public.throne_payment_pending
  where status = 'waiting'
    and expires_at > now()
  order by created_at asc
  limit 1
  for update skip locked;

  if v_pending_id is null then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  v_result := public.complete_throne_payment_pending(v_pending_id, p_gift_event_id);
  return v_result || jsonb_build_object('matched', coalesce((v_result->>'ok')::boolean, false));
end;
$$;

revoke all on function public.match_throne_gift_to_pending(uuid) from public;
grant execute on function public.match_throne_gift_to_pending(uuid) to service_role;

-- Realtime toasts for new gift events.
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
