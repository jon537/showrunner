-- Showrunner 008 — the platform split: creation engines vs distribution engine.
-- A project declares its pipeline at creation:
--   'microdrama'   = full pipeline (story -> style -> bible -> script -> render -> publish)
--   'distribution' = distribute-only (bring finished video; thumbnails/publish half only)
-- Future creation engines (e.g. 'sports') slot in as new pipeline values.
-- Run in the Supabase SQL editor.

alter table sr_projects
  add column if not exists pipeline text not null default 'microdrama';
