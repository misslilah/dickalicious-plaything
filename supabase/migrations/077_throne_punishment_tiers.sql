-- Throne payment tier punishments: amount-based webhook matching + malus relief.
-- Recommended tiers (admin-configurable per template):
--   €5   (500 cents)  → 1 malus point
--   €25  (2500 cents) → 10 malus points
--   €125 (12500 cents) → 50 malus points (or any admin-defined relief)

alter table public.punishment_templates
  add column if not exists throne_payment boolean not null default false;

alter table public.punishment_templates
  add column if not exists throne_amount_cents int
  check (throne_amount_cents is null or throne_amount_cents > 0);

comment on column public.punishment_templates.throne_payment is
  'When true, punishment completes after a Throne gift webhook matches throne_amount_cents.';

comment on column public.punishment_templates.throne_amount_cents is
  'Expected Throne gift amount in cents (e.g. 500 = €5). Used for webhook tier matching.';

-- Pending queue: support punishments (task_id optional).
alter table public.throne_payment_pending
  alter column task_id drop not null;

alter table public.throne_payment_pending
  add column if not exists punishment_template_id uuid
  references public.punishment_templates (id) on delete cascade;

alter table public.throne_payment_pending
  drop constraint if exists throne_payment_pending_target_check;

alter table public.throne_payment_pending
  add constraint throne_payment_pending_target_check
  check (
    (task_id is not null and punishment_template_id is null)
    or (task_id is null and punishment_template_id is not null)
  );

create unique index if not exists throne_payment_pending_user_punishment_waiting_idx
  on public.throne_payment_pending (user_id, punishment_template_id)
  where status = 'waiting' and punishment_template_id is not null;

alter table public.throne_gift_events
  add column if not exists matched_punishment_template_id uuid
  references public.punishment_templates (id) on delete set null;

-- ±5 cents or 2% tolerance for currency rounding.
create or replace function public.throne_amounts_match(p_gift_cents int, p_expected_cents int)
returns boolean
language sql
immutable
as $$
  select
    p_gift_cents is not null
    and p_expected_cents is not null
    and abs(p_gift_cents - p_expected_cents) <= greatest(5, (p_expected_cents * 0.02)::int);
$$;

-- Server-side malus relief (callable by authenticated wrapper and throne webhook).
create or replace function public.complete_punishment_for_user(
  p_user_id uuid,
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cooldown interval := public.punishment_cooldown_interval();
  v_template public.punishment_templates%rowtype;
  v_malus int;
  v_punishments jsonb;
  v_reset_hour int;
  v_last_completed timestamptz;
  v_relieved int;
  v_new_malus int;
  v_date text;
  v_entry jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'User id required.');
  end if;

  select * into v_template
  from public.punishment_templates
  where id = p_template_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Punishment not found.');
  end if;

  select
    malus_points,
    punishments,
    coalesce((settings->>'resetHour')::int, 4)
  into v_malus, v_punishments, v_reset_hour
  from public.user_progress
  where user_id = p_user_id;

  if v_malus is null then
    return jsonb_build_object('ok', false, 'error', 'User progress not found.');
  end if;

  if v_malus <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'You need malus points before you can complete this punishment.'
    );
  end if;

  select completed_at into v_last_completed
  from public.punishment_completions
  where user_id = p_user_id
    and punishment_template_id = p_template_id
  order by completed_at desc
  limit 1;

  if v_last_completed is not null and v_last_completed > now() - v_cooldown then
    return jsonb_build_object(
      'ok', false,
      'error', 'cooldown_active',
      'available_at', v_last_completed + v_cooldown,
      'remaining_seconds', greatest(
        0,
        extract(epoch from (v_last_completed + v_cooldown - now()))::bigint
      )
    );
  end if;

  v_relieved := greatest(coalesce(v_template.malus_points_relieved, 0), 0);
  v_new_malus := greatest(v_malus - v_relieved, 0);

  v_date := to_char(
    case
      when extract(hour from now()) < v_reset_hour then (now() - interval '1 day')::date
      else now()::date
    end,
    'YYYY-MM-DD'
  );

  v_entry := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'title', v_template.title,
    'description', coalesce(v_template.description, ''),
    'trigger', jsonb_build_object('type', 'malus_relief'),
    'pointsLost', 0,
    'active', false,
    'assignedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'date', v_date,
    'templateId', p_template_id::text,
    'completedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  insert into public.punishment_completions (
    user_id,
    punishment_template_id,
    malus_relieved,
    title
  )
  values (p_user_id, p_template_id, v_relieved, v_template.title);

  update public.user_progress
  set
    malus_points = v_new_malus,
    punishments = coalesce(v_punishments, '[]'::jsonb) || v_entry,
    updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'malus_points', v_new_malus,
    'malus_relieved', v_relieved,
    'punishment', v_entry
  );
end;
$$;

revoke all on function public.complete_punishment_for_user(uuid, uuid) from public;
grant execute on function public.complete_punishment_for_user(uuid, uuid) to service_role;

-- Authenticated users cannot manually complete Throne payment punishments.
create or replace function public.complete_punishment(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_template public.punishment_templates%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  select * into v_template
  from public.punishment_templates
  where id = p_template_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Punishment not found.');
  end if;

  if coalesce(v_template.throne_payment, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'This punishment requires Throne payment verification.'
    );
  end if;

  return public.complete_punishment_for_user(v_user_id, p_template_id);
end;
$$;

-- Complete a pending Throne punishment payment and relieve malus.
create or replace function public.complete_throne_punishment_pending(
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
  v_result jsonb;
begin
  select *
  into v_pending
  from public.throne_payment_pending
  where id = p_pending_id
    and status = 'waiting'
    and punishment_template_id is not null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'pending_not_found');
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_pending.user_id
     and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_result := public.complete_punishment_for_user(
    v_pending.user_id,
    v_pending.punishment_template_id
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

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
      matched_punishment_template_id = v_pending.punishment_template_id,
      matched_pending_id = p_pending_id
    where id = p_gift_event_id;
  end if;

  return v_result || jsonb_build_object(
    'matched', true,
    'user_id', v_pending.user_id,
    'punishment_template_id', v_pending.punishment_template_id
  );
end;
$$;

revoke all on function public.complete_throne_punishment_pending(uuid, uuid) from public;
grant execute on function public.complete_throne_punishment_pending(uuid, uuid) to authenticated;
grant execute on function public.complete_throne_punishment_pending(uuid, uuid) to service_role;

-- Match gift by amount tier to oldest waiting punishment pending (FIFO per tier).
create or replace function public.match_throne_gift_to_punishment(p_gift_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift public.throne_gift_events%rowtype;
  v_pending_id uuid;
  v_result jsonb;
begin
  select * into v_gift
  from public.throne_gift_events
  where id = p_gift_event_id;

  if not found or v_gift.amount_cents is null then
    return jsonb_build_object('ok', true, 'matched', false, 'reason', 'no_amount');
  end if;

  select p.id
  into v_pending_id
  from public.throne_payment_pending p
  inner join public.punishment_templates t on t.id = p.punishment_template_id
  where p.status = 'waiting'
    and p.expires_at > now()
    and p.punishment_template_id is not null
    and coalesce(t.throne_payment, false) = true
    and t.throne_amount_cents is not null
    and public.throne_amounts_match(v_gift.amount_cents, t.throne_amount_cents)
  order by p.created_at asc
  limit 1
  for update of p skip locked;

  if v_pending_id is null then
    return jsonb_build_object('ok', true, 'matched', false, 'reason', 'no_pending_tier');
  end if;

  v_result := public.complete_throne_punishment_pending(v_pending_id, p_gift_event_id);
  return v_result || jsonb_build_object(
    'matched', coalesce((v_result->>'ok')::boolean, false),
    'type', 'punishment'
  );
end;
$$;

revoke all on function public.match_throne_gift_to_punishment(uuid) from public;
grant execute on function public.match_throne_gift_to_punishment(uuid) to service_role;

-- Training task FIFO match (unchanged behaviour, task rows only).
create or replace function public.match_throne_gift_to_training(p_gift_event_id uuid)
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
    and task_id is not null
  order by created_at asc
  limit 1
  for update skip locked;

  if v_pending_id is null then
    return jsonb_build_object('ok', true, 'matched', false, 'reason', 'no_pending_training');
  end if;

  v_result := public.complete_throne_payment_pending(v_pending_id, p_gift_event_id);
  return v_result || jsonb_build_object(
    'matched', coalesce((v_result->>'ok')::boolean, false),
    'type', 'training'
  );
end;
$$;

revoke all on function public.match_throne_gift_to_training(uuid) from public;
grant execute on function public.match_throne_gift_to_training(uuid) to service_role;

-- Try punishment tier match first, then training FIFO.
create or replace function public.match_throne_gift_to_pending(p_gift_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.match_throne_gift_to_punishment(p_gift_event_id);
  if coalesce((v_result->>'matched')::boolean, false) then
    return v_result;
  end if;

  return public.match_throne_gift_to_training(p_gift_event_id);
end;
$$;
