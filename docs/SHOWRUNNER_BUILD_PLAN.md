# Showrunner — Build Plan (v0.1, for tearing apart)

> **Codename:** *Showrunner* (placeholder — rename freely). Namespaced `sr_` /
> `sr-*` so it never collides with **AMPD Studios** (a separate product /
> separate Supabase project) or Signal/War Room.
>
> **What it is:** one cloud engine that turns a long-form script into finished
> short videos and auto-publishes them on a schedule, with a single human
> approval tap in the middle. Built once, run as **two instances**:
> - **Instance A (personal test):** AI *animation* series via Seedance/Higgsfield.
> - **Instance B (APN):** *photorealistic sports* pieces. Same engine, different render + accounts.
>
> **Status:** DRAFT. This document is meant to be attacked. Every section ends
> with the assumptions it rests on; the big unresolved decisions are collected
> in **§12 Open Questions**.

---

## 0. Ecosystem & isolation (foundational — read first)

**Showrunner is built OUTSIDE the APN app — its own repo, its own Supabase
project(s).** It is *not* a feature bolted into APN, and *not* a set of tables in
APN's database. This is a deliberate, load-bearing decision.

**Why (the danger of co-locating in APN's Supabase project):**
- APN's Postgres runs the whole business (finance, clients, IOs). Every Showrunner
  migration would run against that live DB — experimental schema next to finance
  tables, one typo/bad-RLS-policy away from an incident.
- Showrunner's cron (`sr-scheduler` every minute + render poller) would run on the
  *same* Postgres already serving APN + Signal — a runaway poll loop competes for
  the connections/CPU that keep the business online.
- It's **video**-heavy: clips/episodes/thumbnails would fill APN's storage and
  quota; media and business-app workloads have opposite profiles.
- Shared `APN_API_KEY`, shared quota, coupled auto-deploy-on-push — a Showrunner
  change could throttle or redeploy APN's functions.
- Blast radius + human error: an experimental always-on media pipeline wants to be
  somewhere you can **break it freely**, not beside your finance data.

**The pattern already exists in your ecosystem: AMPD Studios** — a live product on
its own Supabase project, which APN reaches via `AMPD_URL`/`AMPD_SERVICE_KEY` when
it needs data. Showrunner is the same shape. We're repeating a proven pattern, not
inventing one.

**The isolation decision:**
- **Own Supabase project(s)** — non-negotiable. Own DB, cron, storage, secrets,
  quota. Cannot touch or starve APN. **Both instances live outside APN's project:**
  - *Instance A (personal)* → its own Showrunner project (personal content + personal
    social tokens have no place in APN's DB). **Build here first.**
  - *Instance B (APN sports)* → its own project too (APN-owned like AMPD is
    APN-owned, but separate infra). Decide when greenlit whether it's a **second
    project** (cleanest) or a second `instance` row in one Showrunner project.
- **Own GitHub repo** — recommended (lower stakes than the DB split). Keeps CI
  fully separate so a Showrunner push can never deploy/break APN. Fresh repo =
  zero shared CI surface with the app that runs the business.
- **Migrations restart at `001`** in the new project (not APN's `068`).
- **Integration when needed ≠ co-location.** If Instance B later feeds podcaster
  revenue statements, it bridges via a service key — exactly how APN↔AMPD talk.
  Separation does not block integration; it makes it a controlled doorway.
- **What we reuse = patterns, not infrastructure:** the Signal heartbeat cron
  shape, `_shared/auth.ts`, migration discipline — copied into the new repo.

> Throughout this doc, "Supabase" / "the engine" means **Showrunner's own project**,
> and file paths like `supabase/functions/sr-*` are in the **Showrunner repo**, not
> APN's.

---

## 1. Goals & non-goals

**Goals**
- Script in → publishable ~30s episodes out, 3×/day, always-on.
- One approval interaction per episode (approve the *whole package*: video + title + thumbnail + captions), reject-with-note loops back.
- Swappable adapters for the three volatile surfaces: **render**, **messaging**, **publish** (YouTube/TikTok/Instagram).
- Reuse APN's proven *patterns* (pg_cron heartbeat, edge functions, `_shared`) on the *same stack* (Supabase + Vercel + GitHub) — but in **Showrunner's own repo + Supabase project**, never APN's infra (see §0).

**Non-goals (for now)**
- No monetization/end-screen/card automation (those platform APIs don't expose it).
- No live/real-time rendering — everything is async + queued.
- No multi-user approval workflow in v1 (single approver = you). Team approval is a later nicety.

---

## 2. The confirmed scope numbers (drives everything)

| Fact | Value |
|------|-------|
| Format | **Microdrama, ~60 s** |
| Structure | **4 × 15s clips** per episode |
| Cadence | **1–2 episodes/day** |
| Assembly | **Human editor** — stitch, music, titles, captions, cleanup (NOT automated in v1) |
| Upfront per series | **Bible build** — character / prop / location reference sheets (the big lift) |
| Render volume | ~4–8 clips/day |

**Two findings from Jon's real pipeline test reshaped v1:** (1) 60s/4-clip microdramas
at 1–2/day (not 30s/3×); (2) **a human editor does final assembly** (stitch + music +
titles + captions), which removes the hardest automation (Shotstack/ducking/captions)
from the v1 critical path — see §3 and Q1. Cost is still dominated by render credits ×
rejection rate.

---

## 3. Architecture (one engine, three adapter seams)

```
                    ┌───────── SHOWRUNNER's OWN Supabase project (isolated from APN/AMPD) ─┐
 Script ─► sr-breakdown ─► sr_episodes + sr_shots
 (Claude)                     │
                              ▼
                        sr-render ──►[ RENDER ADAPTER ]──► Higgsfield/Seedance (async ~45s)
                              │            clips land in Supabase Storage (public bucket)
                              ▼
                        sr-stitch ──►[ FINISH: Shotstack ]──► ~30s episode.mp4 (concat+bed+duck+captions+aspect)
                              ▼
                   sr-metadata + sr-thumbnail (Claude + Claude Vision + @vercel/og on VERCEL)
                              ▼
                   sr-approval-send ──►[ MSG ADAPTER ]──► WhatsApp Cloud API ──► YOU
                                                              │  approve / reject+note
                   sr-approval-webhook ◄──────────────────────┘
                              │ approved
                              ▼
                        sr-scheduler (pg_cron, every min) ── picks due slot, respects daily cap
                              ▼
                        sr-publish (per target) ──►[ PUBLISH ADAPTERS ]──► YouTube / TikTok / Instagram
                    └─────────────────────────────────────────────────────────────────────┘
       VERCEL (standalone Showrunner app): dashboard (shot board, bible, cost meter) + @vercel/og thumbnail route
```

**Adapter seams** (the only parts that differ between instances or platforms):
1. **Render adapter** — `higgsfield.ts` (Seedance for animation, photorealistic models for sports). Swappable if you ever change providers.
2. **Messaging adapter** — `whatsapp.ts` (+ `telegram.ts` fallback for the free test).
3. **Publish adapters** — `youtube.ts`, `tiktok.ts`, `instagram.ts`.

Everything between the seams is identical for both instances.

---

## 4. The state machine (episode lifecycle)

Episodes are a **board of rows that move forward**, never a linear script (same philosophy as Signal). A failed step leaves the row where it is and retries — nothing is lost, nothing double-publishes.

```
draft
  └─ sr-breakdown ─►  shots_planned
                        └─ sr-render (all shots done) ─►  rendering ─►  stitching
                                                                          └─►  metadata_pending
                                                                                 └─►  awaiting_approval ─┐
                                          ┌──────────── reject + note (revision++) ◄─────────────────────┤
                                          ▼                                                    approve    ▼
                                    rendering (re-render changed shot only)                          scheduled
                                                                                                        └─ sr-scheduler (slot due) ─► publishing ─► published
                                                                                                                                          └─► failed (retry)
```

Shots have their own sub-lifecycle: `pending → rendering → done | failed`. An episode only advances to `stitching` when **all** its shots are `done`.

---

## 5. Data model (Showrunner's own Supabase project, migration `001_showrunner_core.sql`)

All tables RLS-guarded (staff roles read; service role writes). Prefix `sr_`.
Migrations start at `001` — this is a **fresh project**, not APN's `068+` sequence.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `sr_projects` | A series/instance | `id, name, kind('animation'\|'sports'), instance('personal'\|'apn'), platforms jsonb, cadence int, style_bible jsonb, default_privacy, active` |
| `sr_characters` | Character bible | `id, project_id, name, reference_image_urls text[], higgsfield_character_id, description, notes` |
| `sr_props` | Prop bible | `id, project_id, name, reference_image_urls text[], description` |
| `sr_scripts` | Source 30-min script | `id, project_id, title, raw_text, status('draft'\|'broken_down'\|'done'), created_by` |
| `sr_episodes` | Publishable ~30s unit | `id, script_id, project_id, seq, working_title, status, scheduled_for timestamptz, metadata jsonb, thumbnail_url, final_video_url, reject_notes, revision_count, published_at` |
| `sr_shots` | 15s clip within an episode | `id, episode_id, seq, beat_text, seedance_prompt, ref_ids jsonb, render_job_id, render_status, clip_url, duration_s, revision_count, error` |
| `sr_publish_targets` | One row per episode×platform | `id, episode_id, platform, status('queued'\|'uploading'\|'published'\|'failed'), remote_id, remote_url, error, published_at` |
| `sr_accounts` | Per-platform OAuth token store (**shared with future AdSense work**) | `id, project_id, platform, account_label, access_token, refresh_token, token_expires_at, content_owner_id, scopes, active` |
| `sr_settings` | Global toggles (like `signal_settings`) | `enabled bool, daily_cap int, slot_times jsonb, timezone, per_project overrides` |
| `sr_events` | Audit + KPI log (like `signal_lead_events`) | `id, episode_id, type, actor, payload jsonb, created_at` |

**Design notes**
- `sr_publish_targets` is deliberately one-row-per-platform so a TikTok failure never blocks the YouTube publish and each retries independently.
- Tokens live in `sr_accounts` — the *same shape* APN's pending YouTube AdSense work needs. Since Showrunner is a separate project, that's a reusable **pattern**, not a shared table; if APN's AdSense wants Showrunner's tokens it reads them via a service-key bridge (§0), not co-location.
- `metadata jsonb` holds the whole per-platform package (see §7) so the approval message and the publish step read one source of truth.

---

## 6. Edge functions (Showrunner repo, `supabase/functions/sr-*`)

| Function | Trigger | Responsibility |
|----------|---------|----------------|
| `sr-breakdown` | manual / on script upload | Claude: script → episodes → shots + Seedance prompts (pulls character/prop bible into each prompt). Writes `sr_episodes` + `sr_shots`. |
| `sr-render` | cron poller + on-demand | For `pending` shots, call render adapter (Higgsfield). Stores `render_job_id`; on completion writes `clip_url`. ⚠ poll vs webhook — §12 Q2. |
| `sr-stitch` | when all shots `done` | Calls the `finish` adapter (**Shotstack**): concat clips + music bed + duck + captions + aspect → episode.mp4 (§12 Q1). |
| `sr-metadata` | after stitch | Claude: per-platform title/description/caption/hashtags + thumbnail headline + best-frame choice (Claude Vision over candidate frames). Writes `episode.metadata`. |
| `sr-thumbnail` | after metadata | Extract candidate frames, composite headline via `@vercel/og` (**runs on Vercel**, called from here). Writes `thumbnail_url`. |
| `sr-approval-send` | after thumbnail | Messaging adapter: send video + title + thumbnail + caption to approver. Store provider message id. |
| `sr-approval-webhook` | inbound from WhatsApp | Parse approve / reject+note → flip episode state, `revision_count++` on reject. |
| `sr-scheduler` | **pg_cron every minute** | Find `approved` episodes whose slot is due; respect `daily_cap` + `slot_times`; enqueue `sr_publish_targets`; move to `publishing`. (Mirrors `signal-heartbeat`.) |
| `sr-publish` | per queued target | Refresh token, upload via platform adapter, write `remote_id`/`remote_url`/status. |
| `sr-token-refresh` | pg_cron hourly | Refresh expiring OAuth tokens (shared with AdSense). |

**Shared adapters:** `supabase/functions/_shared/sr/` → `higgsfield.ts`, `whatsapp.ts`, `telegram.ts`, `youtube.ts`, `tiktok.ts`, `instagram.ts`, plus `vercelog.ts` client.

**Crons:** migration `002_showrunner_crons.sql` (Showrunner's project) schedules `sr-scheduler` (`* * * * *`), `sr-render` poller (if polling), `sr-token-refresh` (hourly) — replicating the `net.http_post` pattern from APN's Signal heartbeat cron.

---

## 7. Metadata + thumbnail subsystem

**One Claude call per episode** → structured JSON (keeps title/desc/thumbnail coherent and cheap):

```json
{
  "youtube":   { "title": "...", "description": "...(SEO, hashtags, links)", "tags": ["..."] },
  "tiktok":    { "caption": "...(short hook)", "hashtags": ["..."] },
  "instagram": { "caption": "...", "hashtags": ["..."] },
  "thumbnail": { "headline": "3-5 word hook", "best_frame_idx": 3, "why": "..." }
}
```

**Thumbnail = Claude art-directs, pixels rendered elsewhere.** Recommended path
(**A**): `ffmpeg` pulls ~6 candidate frames → **Claude Vision** picks the hero
frame → `@vercel/og` composites the headline over it (1280×720 PNG, free,
on-infra, gives a consistent series-wide template). Upgrade path (**B**):
generate a designed thumbnail via a Higgsfield image model (GPT Image 2 / Nano
Banana Pro) if hero-frames ever look samey.

---

## 8. Approval loop (WhatsApp Cloud API)

- **Requires the WhatsApp Business _Platform_ (Cloud API / WABA)** — not the consumer Business app. Needs a **dedicated phone number** (the number gets consumed by the API and can't be used in the normal app).
- Outbound: `sr-approval-send` posts a media message (video) + text (title/caption) + image (thumbnail). Because it's business-initiated, this may require an approved **template** for the first touch; replies inside the 24h window are free-form.
- Inbound: Meta webhook → `sr-approval-webhook`. Interpret `approve` / `reject <note>` (buttons or keywords). Flip state.
- Cost at 1 recipient (you) ≈ pennies/month.
- **Free test fallback:** `telegram.ts` adapter — inline Approve/Reject buttons, zero cost, no verification. Build the seam so Instance A can start on Telegram and APN can switch to WhatsApp with a config flag.

---

## 9. Secrets (Showrunner project's *own* edge-secret store — not APN's)

| Secret | For |
|--------|-----|
| `ANTHROPIC_API_KEY` | Claude — **Showrunner's own key**, own billing/quota (do *not* reuse APN's `APN_API_KEY`; that's what isolation means) |
| `HIGGSFIELD_API_KEY` | render + optional image thumbnails |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | messaging |
| `TELEGRAM_BOT_TOKEN` | free test messaging |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | YouTube upload + AdSense (shared) |
| `TIKTOK_CLIENT_KEY` / `_SECRET` | TikTok Content Posting API |
| `META_APP_ID` / `_SECRET` | Instagram Graph publishing |
| `VERCEL_OG_URL` | thumbnail render endpoint |
| `SHOTSTACK_KEY` | assembly/finish step — concat + music bed + duck + captions + aspect (§12 Q1) |

Never commit `.env`. Anon key public-OK; service key/JWT secret never shared (per CLAUDE.md).

---

## 10. Frontend — **standalone** Vercel app (own repo, not an APN page)

Its own small React/Vite app (`src/pages/*`) in the Showrunner repo, deployed to
its own Vercel project — **not** a route added to APN's frontend. Tabs:
- **Board** — kanban of episodes by state (draft → published), the live pulse.
- **Scripts** — upload a source script, trigger breakdown, review/edit generated Seedance prompts before render.
- **Bible** — manage `sr_characters` / `sr_props` (reference images, Higgsfield character ids).
- **Publish log** — `sr_publish_targets` per platform with remote links.
- **Cost meter** — render credits burned today / rejection rate / spend.
- **Settings** — master switch, `slot_times`, `daily_cap` (Carl/Jon style controls).

Plus a Vercel route `/api/og/thumbnail` using `@vercel/og`.

---

## 11. Build order (phased; Instance A proves it before APN)

**Phase 0 — Foundations (spikes first)**
- **Provision the isolation (§0): new GitHub repo + new Supabase project (Instance A / personal) + new Vercel project.** Copy the reusable patterns (`_shared/auth.ts`, heartbeat cron shape) in.
- Migration `001` (schema) + `002` (crons, disabled initially) in the new project.
- **Spike H:** render 2 Seedance clips from a fixed character ref via Higgsfield API — confirm quality + character consistency + how completion is signalled (poll vs webhook). *Gate: consistency good enough?*
- **Spike S:** build `finish()` on **Shotstack** — concat 2 clips + Jon's bed + keyframed duck + burn captions + 9:16 export; judge the ducking by ear (§12 Q1).
- One OAuth round-trip stored in `sr_accounts` (start with YouTube).
- Messaging echo test (Telegram first — free).

**Phase 1 — FRONT half: script → 4 character-bound clips → editor's hands** (no publishing yet)
- **1A · Setup / Bible Builder:** UI + `sr-generate-asset` — for each character/prop/
  location, Claude writes a style-locked prompt → **Nano Banana** renders the
  reference sheet → curate/approve → store in the Bible, indexed to a ref slot.
  *(The big upfront lift; reusable per series.)*
- **1B · Production:** `sr-breakdown` (60s script → 4×15s beats, each tagged with the
  characters/props/location it binds) → `sr-render` (load bound refs into Seedance
  slots + prompt; **Spike H decides API-auto vs prep-for-manual**) → collect 4 clips →
  **editor pack** (4 clips + beat notes + music assets) dropped for the editor.
- **Milestone:** paste a script, get 4 on-model clips in the editor's hands.

**Phase 2 — BACK half: editor returns → publish**
- Editor ingest: upload the finished 60s file back into the system.
- `sr-metadata` (Claude: per-platform titles/descriptions/hashtags) → your approval →
  `sr-scheduler` (1–2/day) → `sr-publish` to **YouTube only** first (private → public
  after audit), then TikTok + Instagram adapters.
- Platform audits submitted (YouTube, TikTok Direct Post, Meta content publishing).

**Phase 3 — Hardening**
- Retry/backoff on render + publish, rejection re-render loop, `sr_events` KPIs, cost meter, alerting on stuck rows. *(Optional: auto-assembly via Shotstack if the editor step becomes the bottleneck — Q1.)*

**Phase 4 — Instance B (APN sports)**
- Stand up its **own Supabase + Vercel project** from the same Showrunner codebase (or, if preferred once greenlit, a second `instance='apn'` row in one Showrunner project — §0). Photorealistic render adapter, APN-owned social accounts. If it needs APN business data (podcaster revenue), bridge via service key — never co-locate. **Zero engine changes** — that's the whole point.

---

## 12. Open questions — the stuff to tear apart

**Q1. Assembly / finish step — SUPERSEDED for v1: a human editor does it.**
Jon's pipeline test put a **real editor** in the loop — cleanup, titles, music,
seamless stitch, export — who returns the finished 60s file to the system. So the
automated finish step (Shotstack/ducking/captions) is **removed from the v1
critical path**; it becomes a **future auto-assembly option** if/when the editor
step is the bottleneck. Jon's music beds (Q11) go to the editor as assets. The
detail below is retained for that future automation:

*(deferred) Shotstack for auto-assembly — easiest setup, zero infra:*
- **The finish step must:** (1) concat 2×15s clips (or pass a native 30s), (2) lay
  Jon's music bed over the 30s, (3) **duck** the bed under dialogue — driven by
  **keyframed volume over the known dialogue spans** (we have the script, so no
  sidechain detection needed), (4) optionally burn captions (SRT from our script),
  (5) output **per-platform aspect** (see Q12).
- **`finish` adapter interface** (hides the backend so the choice is reversible):
  ```
  finish({ clips[], bedTrackUrl, srt?, aspect }) -> finalVideoUrl
  ```
  `sr-stitch` calls this; the Shotstack impl lives in `_shared/sr/shotstack.ts`.
- **Fallback (documented, not built):** if stress-testing shows the keyframed
  ducking is too crude for Jon's ear, escalate *only that adapter* to an **ffmpeg
  worker** (Fly.io/Railway, real `sidechaincompress`). Nothing upstream changes.
- **Validation = in production, not a lab.** Ship Shotstack, watch real episodes,
  judge the ducking/quality by ear; swap the adapter only if it fails.

**Q12. Output aspect ratio per platform (new — surfaced by Q1).** TikTok/Reels/
Shorts are **9:16 vertical**; YouTube can be 16:9 landscape *or* 9:16 (if the
YouTube target is Shorts). Decide whether the series publishes as **YouTube Shorts
(one 9:16 render for all three)** or **a 16:9 YouTube video + 9:16 for TikTok/IG
(two renders per episode)**. Seedance's native output aspect also feeds this —
confirm in Spike H. Leaning: **9:16 everywhere / YouTube Shorts** for a 30s
always-on series (one render, simplest), unless the YouTube channel wants
landscape. **Jon's call.**

**Q2. Higgsfield render completion — webhook or poll?** Their docs are sparse. If they offer a callback, `sr-render` is event-driven; if not, a pg_cron poller checks job status. Needs confirming against the live API in Spike H.

**Q3. Thumbnail rendering home.** `@vercel/og` lives on Vercel, not Supabase — so `sr-thumbnail` calls out to a Vercel route. Fine, but it splits responsibility across two platforms. Acceptable? (Alternative: render thumbnails via the same media API from Q1 and keep it all in one place.)

**Q4. Audio — RESOLVED (was flagged as biggest risk).** Seedance bakes
**synchronized dialogue + SFX into each rendered clip**, so the feared audio
sub-stream (TTS/VO generation + audio-mux) **does not exist**. No ElevenLabs, no
separate voice step. What remains is three small residuals, all of which live in
the stitch/finish step (§12 Q1) — not a new pipeline:
- **(a) Continuity across the 15s cut — a *scripting* rule, not code.** Two
  independently-generated 15s clips each voice their audio without knowing the
  other exists, so a hard concat cuts the audio at the seam too. Fix: if Seedance
  can emit a continuous **30s** clip, there's no seam at all (best outcome — check
  in Spike H). If not, `sr-breakdown` must split beats so each 15s clip is a
  **self-contained unit — audio *and* visual — that cuts cleanly**. Constraint on
  how Claude breaks the script; costs nothing to build.
- **(b) Music bed — CONFIRMED IN (Jon's call).** Dialogue+SFX ≠ a soundtrack,
  and Seedance won't give a *consistent* score across clips, so music is a single
  "lay one track over the finished 30s" overlay in the assembly step
  (Shotstack/Creatomate). **Consequence: the assembly step is now mandatory even
  if Seedance emits 30s natively** — you always pass through it to drop the music
  bed (and duck the bed under dialogue via sidechain/volume automation). New
  sub-decision **Q11: music source + licensing** — a licensed library (Epidemic
  Sound / Artlist — cleared for commercial social, avoids YouTube Content-ID
  claims and IG/TikTok muting) vs AI-generated tracks (Suno/Udio — check
  commercial + platform terms) vs a fixed series theme. Store the chosen track(s)
  per `sr_projects` so the bed is consistent across a series.
- **(c) Burned-in captions — OPTIONAL, high-ROI.** Feeds autoplay muted. No
  transcription needed — **we already have the exact dialogue** (it's what we fed
  Seedance), so `sr-metadata` emits an SRT from our own script and the stitcher
  burns it in.
- **Net:** Q4 is no longer a pipeline risk. It reinforces Q1 — whoever assembles
  the 30s (Shotstack, or nobody-if-Seedance-does-30s-natively) is also where the
  optional music bed and captions land. Audio and stitch are one decision.

**Q5. Character consistency — RESOLVED (mechanism proven in Jon's manual test).**
Per series, upfront: **Claude writes a style-locked prompt** per character/prop/
location → **Nano Banana** (Gemini image) renders a **reference sheet** (look,
wardrobe, angles) → stored in the Bible, **indexed to a Seedance reference slot**.
At render, each beat's bound reference images are loaded into Seedance's slots
(image 1 = char 1, image 2 = char 2 …) and the prompt references them → Seedance
holds appearance across shots. This is the **Setup process** (Phase 1A).
- **Open sub-question → Spike H:** the slot-binding is a **manual UI action** in
  Seedance today. Does the **Higgsfield/Seedance API accept multiple reference
  images programmatically**? **Yes** → render fully automates. **No** → the system
  *prepares* each beat (exact refs + prompt, queued) and a human executes the
  render in the UI. Bible + breakdown + prep are automated **either way**.

**Q6. Approval granularity.** Approve the whole 30s package (simple, recommended) vs approve/reject individual shots (finer control, more taps). v1 = whole package?

**Q7. Ecosystem isolation — RESOLVED: own repo + own Supabase project, outside APN. See §0.** Showrunner is *not* built inside the APN app. Own Supabase project(s) (own DB/cron/storage/secrets/quota), own GitHub repo, own Vercel app — so it can't touch or starve the business app, and can be broken freely. Both instances live outside APN's project; Instance A (personal) first. Follows the **AMPD** precedent (separate project, bridge via service key when integration is needed). Migrations restart at `001`. Full rationale and danger analysis in **§0**.

**Q8. Platform accounts.** Instance A uses *your* personal YouTube/TikTok/IG; Instance B uses APN's + possibly a YouTube **Content Owner (MCN)** context. Keep token sets fully separate per project (they already are, via `sr_accounts.project_id`).

**Q9. Publish audits are the long pole.** YouTube (public-video audit + quota), TikTok (Direct Post review), Meta (content-publishing + business verification) each gate *public* posting. Submit early — code is faster than approvals. Until approved, everything publishes private/sandbox.

**Q10. Rejection cost.** Each reject re-renders (Higgsfield credits). Worth a cap/alert if rejection rate spikes, and a "regenerate only the changed shot" rule (already in the state machine) so a reject doesn't re-render the whole episode.

**Q11. Music source — RESOLVED: Jon's own original beds, Artlist as bench.**
Jon is a musician and will make a **bank of bespoke beds** for the series. This
is the strongest option for an always-on auto-publisher — he **owns the copyright
outright**, so: no Content-ID claims, no Clearlist channel cap, no subscription
dependency, no "rights may not vest" caveat, and an authentically signature sound
per series that he owns.
- **Do:** make **bespoke, unreleased** beds specifically for the show. Avoid
  reusing *released* catalog tracks that a distributor has already fingerprinted
  into Content-ID — YouTube can auto-claim your own videos on your own music.
  Fresh beds have no fingerprint → nothing to claim.
- **Pipeline input:** a **folder of tracks → Supabase bucket → referenced per
  `sr_projects`**; assembly rotates through them and ducks under dialogue. No API,
  no per-episode cost, nothing to integrate.
- **Artlist = optional bench** for moods Jon doesn't want to write. Reintroduces
  the Content-ID friction: Artlist tracks are in CID, so any channel using them
  must be **Clearlisted first (cap: Social 1/platform, Pro 3/platform)**. Jon's own
  bank has none of that.
- **Rejected: Suno.** Good option (no CID claims either) but self-owned music beats
  it on ownership + authenticity and needs no account at all.

---

## 13. Rough cost model (Instance A, per day)

| Item | Est. |
|------|------|
| Higgsfield render — 6×15s clips/day | credit-based, **unit price TBC** (the number to confirm first) |
| Claude — breakdown + metadata | pennies |
| WhatsApp — self-approval | pennies |
| Stitch/thumbnail media API | cents |
| Vercel + Supabase | within existing plans |
| Platform uploads | free |

**Dominant cost = Higgsfield credits × (1 + rejection rate).** Everything else rounds to zero. Confirm per-clip Seedance credit cost in Spike H — that single number decides the daily economics and whether Instance B (sports, likely pricier photorealistic models) needs a budget cap.

---

## 14. First things to do

0. **Provision the isolated home (§0):** new GitHub repo + new Supabase project (personal/Instance A) + new Vercel project. Nothing touches APN.
1. **Spike H** — render 2 consistent Seedance clips from a character ref; note completion mechanism (webhook/poll), native aspect, and per-clip cost. *This is the gating spike (Q5) — if character consistency fails, stop and rethink.*
2. **Spike S** — build `finish()` on Shotstack (concat + your bed + duck + captions + 9:16) against real clips; judge ducking by ear.
3. **Confirm the WhatsApp account type** (Cloud API/WABA vs consumer app) + grab a dedicated number. And answer **Q12** (aspect: 9:16-everywhere vs 16:9-YouTube + 9:16-social).

Resolved and off the list: Q1 (Shotstack), Q4 (Seedance bakes audio), Q7 (isolated own repo/project), Q11 (Jon's own beds).
