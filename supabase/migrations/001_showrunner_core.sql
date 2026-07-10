-- Showrunner — core schema (fresh project, migration 001)
-- Microdrama pipeline: Bible (characters/props/locations) -> script breakdown
-- (4 x 15s beats) -> Seedance render -> editor pack -> (Phase 2) publish.
-- Run this in the Supabase SQL editor of the NEW Showrunner project.

-- ---------- enums ----------
create type sr_asset_kind    as enum ('character','prop','location');
create type sr_asset_status  as enum ('draft','prompt_ready','generating','ready','archived');
create type sr_episode_status as enum (
  'draft','shots_planned','rendering','clips_ready',   -- front half (Phase 1)
  'with_editor','editor_returned',                     -- human editor loop
  'metadata_pending','awaiting_approval','approved',   -- back half (Phase 2)
  'scheduled','publishing','published','failed'
);
create type sr_shot_status    as enum ('pending','rendering','done','failed');
create type sr_publish_status  as enum ('queued','uploading','published','failed');
create type sr_platform        as enum ('youtube','tiktok','instagram');

-- ---------- projects (a series / instance) ----------
create table sr_projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null default 'animation',      -- 'animation' | 'sports'
  instance      text not null default 'personal',       -- 'personal' | 'apn'
  style_note    text,                                    -- global style prompt seed
  platforms     jsonb not null default '["youtube","tiktok","instagram"]',
  cadence       int  not null default 1,                 -- episodes/day (1-2)
  music_bed_urls jsonb not null default '[]',            -- Jon's beds (for the editor)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- the Bible: characters / props / locations ----------
create table sr_assets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references sr_projects(id) on delete cascade,
  kind          sr_asset_kind not null,
  name          text not null,
  ref_slot      int,                                     -- Seedance slot index (1..N)
  gen_prompt    text,                                    -- Claude-written style-locked prompt
  description   text,                                    -- wardrobe / traits / notes
  reference_image_urls jsonb not null default '[]',      -- Nano Banana sheet(s), bucket URLs
  seedance_ref_id text,                                  -- if the API returns a saved ref id
  status        sr_asset_status not null default 'draft',
  created_at    timestamptz not null default now()
);
create index on sr_assets (project_id, kind);

-- ---------- scripts ----------
create table sr_scripts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references sr_projects(id) on delete cascade,
  title         text,
  raw_text      text not null,
  status        text not null default 'draft',           -- 'draft'|'broken_down'
  created_at    timestamptz not null default now()
);

-- ---------- episodes (~60s microdrama) ----------
create table sr_episodes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references sr_projects(id) on delete cascade,
  script_id     uuid references sr_scripts(id) on delete set null,
  seq           int,
  working_title text,
  status        sr_episode_status not null default 'draft',
  editor_pack_url text,        -- zip / folder link handed to the editor (Phase 1 output)
  final_video_url text,        -- editor's returned 60s file (Phase 2 input)
  metadata      jsonb,         -- per-platform titles/descriptions/hashtags (Phase 2)
  scheduled_for timestamptz,
  reject_notes  text,
  revision_count int not null default 0,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index on sr_episodes (project_id, status);

-- ---------- shots (4 x 15s per episode) ----------
create table sr_shots (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid not null references sr_episodes(id) on delete cascade,
  seq           int not null,                            -- 1..4
  beat_text     text,                                    -- the 15s beat
  seedance_prompt text,                                  -- prompt for this clip
  bound_asset_ids jsonb not null default '[]',           -- sr_assets that appear (the binding)
  render_job_id text,
  render_status sr_shot_status not null default 'pending',
  clip_url      text,
  duration_s    numeric default 15,
  error         text,
  created_at    timestamptz not null default now()
);
create index on sr_shots (episode_id, seq);

-- ---------- publish targets (Phase 2; one row per episode x platform) ----------
create table sr_publish_targets (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid not null references sr_episodes(id) on delete cascade,
  platform      sr_platform not null,
  status        sr_publish_status not null default 'queued',
  remote_id     text,
  remote_url    text,
  error         text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (episode_id, platform)
);

-- ---------- OAuth token store (Phase 2; also the AdSense-shaped store) ----------
create table sr_accounts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references sr_projects(id) on delete cascade,
  platform      sr_platform not null,
  account_label text,
  access_token  text,
  refresh_token text,
  token_expires_at timestamptz,
  content_owner_id text,        -- YouTube MCN / CMS context
  scopes        text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- settings + event log ----------
create table sr_settings (
  id            int primary key default 1,
  enabled       boolean not null default false,   -- master publish switch (Phase 2)
  daily_cap     int not null default 2,
  slot_times    jsonb not null default '["09:00","17:00"]',
  timezone      text not null default 'Africa/Johannesburg',
  constraint sr_settings_singleton check (id = 1)
);
insert into sr_settings (id) values (1) on conflict do nothing;

create table sr_events (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid references sr_episodes(id) on delete cascade,
  type          text not null,
  actor         text,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

-- ---------- RLS (single-user personal instance: authenticated can do all) ----------
-- Tighten later for multi-user / Instance B. Service role bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array[
    'sr_projects','sr_assets','sr_scripts','sr_episodes','sr_shots',
    'sr_publish_targets','sr_accounts','sr_settings','sr_events'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$create policy "auth all" on %I for all to authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

-- ---------- storage bucket for clips / reference sheets / editor packs ----------
insert into storage.buckets (id, name, public)
values ('showrunner', 'showrunner', true)
on conflict (id) do nothing;
