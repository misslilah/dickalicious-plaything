-- Optional Throne gift id on punishment templates (secondary metadata; webhook still matches amount_cents).

alter table public.punishment_templates
  add column if not exists throne_gift_id text;

comment on column public.punishment_templates.throne_gift_id is
  'Throne wishlist item id selected when creating a Throne payment punishment (optional; amount_cents remains primary for webhook matching).';
