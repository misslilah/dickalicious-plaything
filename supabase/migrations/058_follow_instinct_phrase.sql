-- Follow your instinct: optional phrase_to_type per round in rounds jsonb.
-- Round object shape:
--   image_path (text, required)
--   order_text (text, required)
--   order_type (text enum: close_eyes | open_mouth | tongue_out, required)
--   phrase_to_type (text, optional) — when set, player must type it (trim, case-insensitive)
--     while holding the camera pose for that round's order_type.
-- No column change: rounds jsonb from 057 accepts the new optional key.

comment on column public.follow_instinct_games.rounds is
  'JSON array of rounds: image_path, order_text, order_type; optional phrase_to_type for type-a-phrase challenges.';
