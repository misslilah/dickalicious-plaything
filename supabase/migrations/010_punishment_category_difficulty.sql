-- Difficulty tier for punishment categories (Easy / Medium / Hard sections)

alter table public.punishment_categories
  add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy', 'medium', 'hard'));

-- Backfill from legacy category names
update public.punishment_categories
set difficulty = lower(trim(name))
where lower(trim(name)) in ('easy', 'medium', 'hard')
  and (difficulty is null or difficulty = 'medium');

-- Map seeded sort_order to difficulty when name did not match
update public.punishment_categories
set difficulty = case sort_order
  when 0 then 'easy'
  when 1 then 'medium'
  when 2 then 'hard'
  else difficulty
end
where difficulty = 'medium'
  and lower(trim(name)) not in ('easy', 'medium', 'hard');
