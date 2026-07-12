-- Showrunner 006 — the serialized script engine. A project becomes a never-ending
-- micro-drama SERIES: premise + market + rolling story memory + live cliffhanger.
-- Each generated episode advances the story. Run in the Supabase SQL editor.

alter table sr_projects
  add column if not exists premise          text,               -- the series setup (Jon agrees this)
  add column if not exists market           text default 'South Africa',
  add column if not exists series_notes     text,               -- extra guidance / do's & don'ts
  add column if not exists story_state      text,               -- rolling "story so far" (memory)
  add column if not exists next_cliffhanger text,               -- the live cliff to resolve next
  add column if not exists shots_per_episode int not null default 4;

-- per-shot: its function in the beat arc, and whether it chains off the prior clip
alter table sr_shots
  add column if not exists beat_function   text,   -- hook | escalate | turn | cliff
  add column if not exists chain_from_prev boolean not null default false;
