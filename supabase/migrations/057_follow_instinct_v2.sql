-- Idempotent: Follow your instinct v2 — photo + order rounds, challenge mode.
-- Safe to run multiple times in Supabase SQL Editor.

do $$ begin
  create type public.follow_instinct_challenge_mode as enum ('close_eyes', 'mouth_tongue', 'both');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.follow_instinct_order_type as enum ('close_eyes', 'open_mouth', 'tongue_out');
exception
  when duplicate_object then null;
end $$;

alter table public.follow_instinct_games
  add column if not exists challenge_mode public.follow_instinct_challenge_mode not null default 'both';

alter table public.follow_instinct_games
  add column if not exists rounds jsonb not null default '[]'::jsonb;

alter table public.follow_instinct_games
  alter column left_image_path drop not null;

alter table public.follow_instinct_games
  alter column right_image_path drop not null;

-- Backfill rounds from legacy left/right panel images.
update public.follow_instinct_games
set
  rounds = jsonb_build_array(
    jsonb_build_object(
      'image_path', left_image_path,
      'order_text', 'Close your eyes',
      'order_type', 'close_eyes'
    ),
    jsonb_build_object(
      'image_path', right_image_path,
      'order_text', 'Open your mouth',
      'order_type', 'open_mouth'
    )
  ),
  challenge_mode = 'both'::public.follow_instinct_challenge_mode
where
  jsonb_array_length(rounds) = 0
  and left_image_path is not null
  and right_image_path is not null;
