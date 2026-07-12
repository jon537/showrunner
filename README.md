# Showrunner

Automated microdrama pipeline — **isolated from APN** (its own repo + its own
Supabase project). Turns a 60-second script into 4 character-bound Seedance clips
ready for a human editor. See `docs/SHOWRUNNER_BUILD_PLAN.md` for the full design.

**Phase 1 (this starter):** Bible builder + script breakdown + render prep.
No publishing yet (that's Phase 2).

```
supabase/
  migrations/001_showrunner_core.sql   # the schema — run in the SQL editor
  functions/
    _shared/util.ts                    # CORS/json, service client, Claude, upload
    sr-breakdown/                      # 60s script -> 4 x 15s bound beats (Claude)
    sr-generate-asset/                 # Bible: Claude prompt -> Nano Banana sheet
    sr-render/                         # bind refs -> Seedance (prep | api mode)
web/                                   # Vite + React dashboard (Bible / Script / Board)
```

---

## Setup — step by step

### 1. Create the isolated homes (nothing touches APN)
- **GitHub:** create a new empty repo, e.g. `showrunner` (see push commands below).
- **Supabase:** create a **new project** (not APN's). Note its URL, anon key,
  service-role key. Region close to you.
- **Vercel:** create a new project later, pointed at `web/` (Phase 1 can run local).

### 2. Database
- Open the new project's **SQL Editor** → paste `supabase/migrations/001_showrunner_core.sql` → Run.
- This creates the `sr_*` tables, RLS, and the public `showrunner` storage bucket.

### 3. Secrets (edge functions)
Install the Supabase CLI, then link and set secrets:
```bash
supabase login
supabase link --project-ref YOUR_NEW_PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        # Showrunner's OWN key
supabase secrets set GEMINI_API_KEY=...                  # Nano Banana / Gemini image
supabase secrets set RENDER_MODE=prep                    # manual Seedance until Spike H
```
(See `.env.example` for the full list.)

### 4. Deploy the functions
```bash
supabase functions deploy sr-breakdown
supabase functions deploy sr-generate-asset
supabase functions deploy sr-render
```

### 5. Run the dashboard
```bash
cd web
cp .env.example .env      # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5175
```
Sign in with a magic link (Supabase sends it; enable Email auth in the project).

---

## First run (proves Phase 1)
1. **Bible tab** — add your characters/props/locations, hit **generate sheet**
   on each (Claude writes the prompt → Nano Banana renders it). Curate.
2. **Script tab** — paste a 60s microdrama → **Break into 4 beats**. Claude binds
   your Bible assets to each beat and writes a Seedance prompt.
3. **Board tab** — **Render / prep clips**. In `prep` mode you get, per clip, the
   prompt + the exact reference images to drop into Seedance's slots. Render the
   4 clips, hand them to your editor.

## Spike H (the one thing to confirm)
`sr-render` ships in **`prep`** mode (assemble refs + prompt, you render in the
Seedance UI). If the Higgsfield/Seedance API supports loading multiple reference
images programmatically, implement `submitRender()` in `sr-render/index.ts`, set
`RENDER_MODE=api`, and rendering fully automates.

## Go-live checklist (before "turning the machine on")
- [ ] **Switch to Nano Banana Pro** — testing runs on standard Nano Banana to
      save cost. Before production: Supabase → Edge Functions → Secrets → set
      `NANO_BANANA_MODEL=gemini-3-pro-image-preview`, redeploy functions, and
      **regenerate the style plate + all reference sheets** on Pro so the
      canonical refs are top quality.
- [ ] Regenerate any Bible sheets that were cast during testing.
- [ ] Resolve Spike H (`RENDER_MODE=api` if the Higgsfield API supports multi-ref).
- [ ] Voice lock (Phase 3): assign real TTS/cloned voices per character
      (voice_profile text is the interim consistency mechanism).

---

## Push to your new GitHub repo
```bash
cd showrunner
git init
git add -A
git commit -m "Showrunner starter — Phase 1 (Bible + breakdown + render prep)"
git branch -M main
git remote add origin git@github.com:YOURNAME/showrunner.git
git push -u origin main
```
