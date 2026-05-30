-- Configurable opacity for random background GIF rotation.

alter table public.gif_bank_settings
  add column if not exists rotation_opacity numeric(5, 4) not null default 0.03
    check (rotation_opacity >= 0 and rotation_opacity <= 1);
