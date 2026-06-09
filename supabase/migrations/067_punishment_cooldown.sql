-- Idempotent: 6-hour cooldown per punishment template per user (since last completion).
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.punishment_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  punishment_template_id uuid not null references public.punishment_templates (id) on delete cascade,
  completed_at timestamptz not null default now(),
  malus_relieved int not null default 0,
  title text not null default ''
);

create index if not exists punishment_completions_user_template_completed_idx
  on public.punishment_completions (user_id, punishment_template_id, completed_at desc);

alter table public.punishment_completions enable row level security;

drop policy if exists "punishment_completions_select_own" on public.punishment_completions;
create policy "punishment_completions_select_own"
  on public.punishment_completions for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

create or replace function public.punishment_cooldown_interval()
returns interval
language sql
immutable
as $$
  select interval '6 hours';
$$;

create or replace function public.get_punishment_cooldowns()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cooldown interval := public.punishment_cooldown_interval();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'cooldowns', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'template_id', recent.punishment_template_id,
          'completed_at', recent.completed_at,
          'available_at', recent.completed_at + v_cooldown,
          'remaining_seconds', greatest(
            0,
            extract(epoch from (recent.completed_at + v_cooldown - now()))::bigint
          )
        )
        order by recent.completed_at desc
      )
      from (
        select distinct on (punishment_template_id)
          punishment_template_id,
          completed_at
        from public.punishment_completions
        where user_id = v_user_id
          and completed_at > now() - v_cooldown
        order by punishment_template_id, completed_at desc
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.complete_punishment(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
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
  where user_id = v_user_id;

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
  where user_id = v_user_id
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
  values (v_user_id, p_template_id, v_relieved, v_template.title);

  update public.user_progress
  set
    malus_points = v_new_malus,
    punishments = coalesce(v_punishments, '[]'::jsonb) || v_entry,
    updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'malus_points', v_new_malus,
    'malus_relieved', v_relieved,
    'punishment', v_entry
  );
end;
$$;
