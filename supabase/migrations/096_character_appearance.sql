-- Paper-doll character appearance on profiles (layered sprite, not a flattened combo).
-- Gender + body-size fields are nullable until the required first-login creator runs.
-- character_equipped is an empty object for now; paid shop clothes will store { slot: itemId }.

alter table public.profiles
  add column if not exists character_gender text
    check (character_gender is null or character_gender in ('female', 'male')),
  add column if not exists character_breast_size text
    check (character_breast_size is null or character_breast_size in ('small', 'medium', 'large')),
  add column if not exists character_penis_size text
    check (character_penis_size is null or character_penis_size in ('small', 'medium', 'large')),
  add column if not exists character_equipped jsonb not null default '{}'::jsonb;

comment on column public.profiles.character_gender is
  'Paper-doll base: female | male. Null until the user finishes character creation.';
comment on column public.profiles.character_breast_size is
  'Female size overlay: small | medium | large. Null for male or unset.';
comment on column public.profiles.character_penis_size is
  'Male size overlay: small | medium | large. Null for female or unset.';
comment on column public.profiles.character_equipped is
  'Future paid shop: { "top" | "bottom" | "underwear": clothing_id }. Empty until clothes exist.';

-- Existing profiles_update_own already lets a user update their own row (RLS).
-- Privileged-column trigger (055) does not touch these fields.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_character_equipped_object'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_character_equipped_object
      check (jsonb_typeof(character_equipped) = 'object');
  end if;
end
$$;
