-- Showrunner 003 — Style is Step 1. A locked style guide + aspect ratio + a
-- visual style plate that gets injected into EVERY character/prop/location render
-- so the whole series shares one look. Run in the Supabase SQL editor.

alter table sr_projects
  add column if not exists style_brief   text,             -- Jon's loose input
  add column if not exists style_guide   text,             -- AI-enhanced detailed spec
  add column if not exists style_image_url text,           -- the style plate (reference)
  add column if not exists aspect_ratio  text not null default '9:16',  -- '16:9' | '9:16'
  add column if not exists style_locked  boolean not null default false;
