-- Optional completion requirements on punishment templates (phrase, timer, URL)

alter table public.punishment_templates
  add column if not exists required_phrases text[] not null default '{}';

alter table public.punishment_templates
  add column if not exists required_phrase_repeat_count int not null default 1
  check (required_phrase_repeat_count >= 1);

alter table public.punishment_templates
  add column if not exists timer_seconds int
  check (timer_seconds is null or timer_seconds > 0);

alter table public.punishment_templates
  add column if not exists open_url text
  check (
    open_url is null
    or open_url ~* '^https?://'
  );
