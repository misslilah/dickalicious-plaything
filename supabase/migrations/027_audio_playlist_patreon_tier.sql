-- Patreon tier requirement on audio playlists (run after 026_audio_playlists.sql)

alter table public.audio_playlists
  add column if not exists patreon_tier text
    check (patreon_tier is null or patreon_tier in ('sweetie', 'princess', 'slut'));
