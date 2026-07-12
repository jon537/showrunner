-- Showrunner 007 — front of funnel: concept pitching + series planning + voices.
-- Run in the Supabase SQL editor.

alter table sr_projects
  add column if not exists concept    jsonb,   -- the chosen pitched concept
  add column if not exists season_map jsonb;   -- [{ep, logline, cliff}] up to ~100

alter table sr_assets
  add column if not exists voice_profile text; -- characters: tone/accent/pace for audio consistency
