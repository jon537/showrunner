-- Showrunner 004 — two-stage asset creation: CAST (pick from options) then
-- build the reference SHEET from the chosen look. Run in the Supabase SQL editor.

alter table sr_assets
  add column if not exists options          jsonb not null default '[]', -- casting candidate URLs
  add column if not exists chosen_image_url text;                        -- the approved look

-- status flows: draft -> casting -> chosen -> ready. Move status to plain text
-- so we don't fight the enum (values: draft|casting|chosen|ready|generating).
alter table sr_assets alter column status type text using status::text;
