// sr-write-episode — the serialized micro-drama script engine. Writes the NEXT
// episode (N shots x 15s) from the baked-in format + premise + rolling story
// memory + last cliffhanger + the Bible. Advances the story so it never ends.
//
// POST { project_id }  ->  { episode_id, seq, working_title, caption, cliffhanger, shots }
import { CORS, json, preflight, serviceClient, claude, extractJson } from "../_shared/util.ts";

interface Shot {
  seq: number;
  beat_function: string;      // hook | escalate | turn | cliff
  beat_text: string;
  seedance_prompt: string;    // rich locked-format prompt
  dialogue: string;
  chain_from_prev: boolean;
  bound_asset_names: string[];
}
interface Written {
  working_title: string;
  caption: string;            // on-screen / social caption (added in post)
  shots: Shot[];
  cliffhanger: string;        // the new live cliff
  story_state: string;        // updated rolling memory
}

// The baked-in "deep dive" — the micro-drama formula, applied every episode.
const FORMAT = `
You are the head writer of a NEVER-ENDING vertical micro-drama series for African
audiences (South Africa / Nigeria / Kenya) published on YouTube & TikTok. You write
in SHOTS, not scenes. Rules — obey every one:

STRUCTURE
- One EPISODE = exactly N shots. Each shot is ONE 15-second Seedance generation =
  ONE beat: a single gesture, line, or status-shift. Do not cram.
- The beat arc across the episode: SHOT 1 = HOOK (in the first ~2 seconds catch &
  twist the previous cliffhanger, then escalate), middle shots ESCALATE then TURN,
  FINAL shot = CLIFF — the last frame is an unresolved detonation.
- NEVER resolve the story. Every episode ends mid-tension so it can always continue.
- Cut between angles shot to shot (wide / reverse / reaction / insert) — cutting
  hides AI drift. Only set chain_from_prev=true when a shot is a CONTINUOUS action
  from the previous one (e.g. a wrist-grab); otherwise it's a clean cut.

EMOTIONAL ENGINE (this is the fuel — not action)
- Betrayal, injustice, secret power/wealth, family/lobola/inheritance, vindication.
- Addictive, legible in seconds, skews to women. Deliver world-building in tiny
  increments, never exposition.

DIALOGUE
- Max 1–2 SHORT lines per shot (15s won't carry more clean lip-sync).
- Put the biggest / most sync-risky line OFF-SCREEN over a reaction shot.
- Captions are added in post — never bake caption text into the prompt.

PROMPT FORMAT (each seedance_prompt, every time)
- Name the Bible characters present and lock identity: "keep consistent facial
  features; do not blend the characters." Reference only characters that exist in
  the Bible, by their exact names, and list them in bound_asset_names.
- Embed the STYLE GUIDE verbatim. Describe scene + action. Specify CAMERA and the
  END FRAME. State the aspect ratio. Describe the audio/dialogue (mark off-screen).

CONTINUITY
- Continue from STORY SO FAR and pay off / advance the PREVIOUS CLIFFHANGER.
- Output an updated, compact STORY SO FAR (a few sentences: who, relationships,
  open threads, what just changed) and the NEW cliffhanger.

Return ONLY JSON.`;

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const sb = serviceClient();
    const { data: proj, error: pe } = await sb.from("sr_projects").select("*").eq("id", project_id).single();
    if (pe || !proj) return json({ error: "project not found" }, 404);
    if (!proj.style_locked) return json({ error: "Set the series STYLE first (Step 1)." }, 400);
    if (!proj.premise) return json({ error: "Add a PREMISE for the series first (Script tab)." }, 400);

    const aspect = proj.aspect_ratio === "16:9" ? "16:9" : "9:16";
    const nShots = proj.shots_per_episode || 4;

    const { data: assets } = await sb.from("sr_assets")
      .select("id,kind,name,description,voice_profile").eq("project_id", project_id).eq("status", "ready");
    if (!assets?.length)
      return json({ error: "Build at least one Bible character/prop/location (sheet ready) first." }, 400);
    const bible = assets.map(a =>
      `- [${a.kind}] ${a.name}: ${a.description ?? ""}` +
      (a.voice_profile ? ` | VOICE: ${a.voice_profile}` : "")).join("\n");

    const { count } = await sb.from("sr_episodes")
      .select("id", { count: "exact", head: true }).eq("project_id", project_id);
    const seq = (count ?? 0) + 1;

    // If the season was mapped upfront, steer this episode by its planned slot.
    const mapEntry = Array.isArray(proj.season_map)
      ? (proj.season_map as { ep: number; logline: string; cliff: string }[]).find(m => m.ep === seq)
      : null;

    const user =
      `SERIES PREMISE:\n${proj.premise}\n\nMARKET: ${proj.market}\n` +
      (proj.series_notes ? `NOTES: ${proj.series_notes}\n` : "") +
      `\nSTYLE GUIDE (embed verbatim in every seedance_prompt):\n${proj.style_guide}\n` +
      `ASPECT: ${aspect}\n\nBIBLE (only these characters/props/locations may appear):\n${bible}\n\n` +
      `STORY SO FAR:\n${proj.story_state || "(none — this is the PILOT, Episode 1. Establish the world and the central injustice, and end on the first cliffhanger.)"}\n\n` +
      `PREVIOUS CLIFFHANGER:\n${proj.next_cliffhanger || "(none — write the pilot)"}\n\n` +
      (mapEntry ? `PLANNED SLOT (season map — follow it): EP ${seq}: ${mapEntry.logline} → cliff: ${mapEntry.cliff}\n\n` : "") +
      `When a character speaks, direct the audio using their VOICE profile from the Bible.\n` +
      `Write EPISODE ${seq} as EXACTLY ${nShots} shots.\n` +
      `Return JSON: {"working_title":str,"caption":str,"shots":[{"seq":1,` +
      `"beat_function":"hook|escalate|turn|cliff","beat_text":str,"seedance_prompt":str,` +
      `"dialogue":str,"chain_from_prev":bool,"bound_asset_names":[str]}, ... ${nShots} ],` +
      `"cliffhanger":str,"story_state":str}`;

    const out = await claude({ system: FORMAT.replace("N shots", `${nShots} shots`), user, maxTokens: 4000 });
    const w = extractJson<Written>(out);
    if (!w.shots || w.shots.length !== nShots)
      return json({ error: `writer returned ${w.shots?.length ?? 0} shots, expected ${nShots}`, raw: out }, 422);

    const byName = new Map(assets.map(a => [a.name.toLowerCase(), a.id]));

    const { data: ep, error: ee } = await sb.from("sr_episodes").insert({
      project_id, seq, working_title: w.working_title, status: "shots_planned",
      metadata: { caption: w.caption, cliffhanger: w.cliffhanger },
    }).select().single();
    if (ee) throw ee;

    const shots = w.shots.map(s => ({
      episode_id: ep.id, seq: s.seq, beat_text: s.beat_text, beat_function: s.beat_function,
      seedance_prompt: s.seedance_prompt, chain_from_prev: !!s.chain_from_prev,
      bound_asset_ids: (s.bound_asset_names ?? []).map(n => byName.get(n.toLowerCase())).filter(Boolean),
    }));
    const { error: se } = await sb.from("sr_shots").insert(shots);
    if (se) throw se;

    // Advance the rolling memory + live cliffhanger.
    await sb.from("sr_projects").update({
      story_state: w.story_state, next_cliffhanger: w.cliffhanger,
    }).eq("id", project_id);
    await sb.from("sr_events").insert({ episode_id: ep.id, type: "write_episode", payload: { seq } });

    return json({
      episode_id: ep.id, seq, working_title: w.working_title,
      caption: w.caption, cliffhanger: w.cliffhanger, shots,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
