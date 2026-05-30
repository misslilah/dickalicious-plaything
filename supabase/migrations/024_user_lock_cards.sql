-- Admin lock cards: block a user site-wide until they type a phrase N times

create table if not exists public.user_lock_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phrase text not null check (char_length(trim(phrase)) > 0),
  required_count int not null check (required_count >= 1),
  completed_count int not null default 0 check (completed_count >= 0),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  active boolean not null default true
);

create index if not exists user_lock_cards_user_id_active_idx
  on public.user_lock_cards (user_id)
  where active = true;

create unique index if not exists user_lock_cards_one_active_per_user
  on public.user_lock_cards (user_id)
  where active = true;

alter table public.user_lock_cards enable row level security;

drop policy if exists "user_lock_cards_select" on public.user_lock_cards;
create policy "user_lock_cards_select"
  on public.user_lock_cards for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_lock_cards_admin_insert" on public.user_lock_cards;
create policy "user_lock_cards_admin_insert"
  on public.user_lock_cards for insert to authenticated
  with check (public.is_admin());

drop policy if exists "user_lock_cards_admin_update" on public.user_lock_cards;
create policy "user_lock_cards_admin_update"
  on public.user_lock_cards for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "user_lock_cards_admin_delete" on public.user_lock_cards;
create policy "user_lock_cards_admin_delete"
  on public.user_lock_cards for delete to authenticated
  using (public.is_admin());

-- Users submit progress only through this RPC (prevents cheating on completed_count).
create or replace function public.submit_lock_card_phrase(
  lock_id uuid,
  submitted_phrase text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_row public.user_lock_cards%rowtype;
  trimmed_input text;
  trimmed_phrase text;
begin
  trimmed_input := trim(submitted_phrase);

  select * into lock_row
  from public.user_lock_cards
  where id = lock_id
    and user_id = auth.uid()
    and active = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Lock card not found.');
  end if;

  trimmed_phrase := trim(lock_row.phrase);

  if trimmed_input <> trimmed_phrase then
    return jsonb_build_object(
      'ok', true,
      'correct', false,
      'completed_count', lock_row.completed_count,
      'required_count', lock_row.required_count,
      'cleared', false
    );
  end if;

  lock_row.completed_count := lock_row.completed_count + 1;

  if lock_row.completed_count >= lock_row.required_count then
    update public.user_lock_cards
    set completed_count = lock_row.completed_count,
        active = false,
        cleared_at = now()
    where id = lock_id;

    return jsonb_build_object(
      'ok', true,
      'correct', true,
      'completed_count', lock_row.completed_count,
      'required_count', lock_row.required_count,
      'cleared', true
    );
  end if;

  update public.user_lock_cards
  set completed_count = lock_row.completed_count
  where id = lock_id;

  return jsonb_build_object(
    'ok', true,
    'correct', true,
    'completed_count', lock_row.completed_count,
    'required_count', lock_row.required_count,
    'cleared', false
  );
end;
$$;

revoke all on function public.submit_lock_card_phrase(uuid, text) from public;
grant execute on function public.submit_lock_card_phrase(uuid, text) to authenticated;

-- Realtime updates (best effort; safe if publication is missing locally).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_lock_cards'
    ) then
      alter publication supabase_realtime add table public.user_lock_cards;
    end if;
  end if;
exception
  when others then null;
end $$;
