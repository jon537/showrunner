// sr-plan-series — the big upfront pass, run once after Style is locked:
//   1. Maps the season: up to ~100 brief episode loglines, each with its cliff.
//   2. Manifests the ENTIRE recurring world: every character (with a detailed
//      generation prompt + a voice profile), every recurring prop, every location
//      — inserted into the Bible as draft assets ready for casting/sheets, with
//      prompts you can also run outside the app.
//
// POST { project_id, episodes? }  ->  { episodes, characters, props, locations }
import { CORS, json, preflight, serviceClient, claude, extractJson } from "../_shared/util.ts";

interface MapEntry { ep: number; logline: string; cliff: string; }
interface ManifestChar { name: string; description: string; detailed_prompt: string; voice_profile: string; }
interface ManifestItem { name: string; description: string; detailed_prompt: string; }
interface Manifest { characters: ManifestChar[]; props: ManifestItem[]; locations: ManifestItem[]; }

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { project_id, episodes } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);
    const epCount = Math.min(Math.max(Number(episodes) || 100, 10), 100);

    const sb = serviceClient();
    const { data: proj } = await sb.from("sr_projects").select("*").eq("id", project_id).single();
    if (!proj) return json({ error: "project not found" }, 404);
    if (!proj.premise) return json({ error: "Choose a concept / set the premise first (Story tab)." }, 400);
    if (!proj.style_locked) return json({ error: "Lock the Style first (Step 2)." }, 400);

    // ---- 1. Season map ----
    const mapOut = await claude({
      system:
        "You are the showrunner of a never-ending 60-second vertical micro-drama. " +
        "Map the season as brief episode loglines. Each episode = hook -> escalate " +
        "-> turn -> CLIFF; no episode ever resolves the story. Build one escalating " +
        "serialized thread with arcs every ~10-15 episodes (reveal, reversal, new " +
        "antagonist, temporary victory that curdles). Keep each logline to ONE " +
        "sentence and each cliff to ONE short sentence. Return ONLY JSON.",
      user:
        `PREMISE:\n${proj.premise}\n\nMARKET: ${proj.market}\n` +
        (proj.series_notes ? `NOTES: ${proj.series_notes}\n` : "") +
        `\nMap EXACTLY ${epCount} episodes.\n` +
        `Return JSON: {"episodes":[{"ep":1,"logline":str,"cliff":str}, ...]}`,
      maxTokens: 8000,
    });
    const map = extractJson<{ episodes: MapEntry[] }>(mapOut);
    if (!map.episodes?.length) return json({ error: "no season map returned" }, 422);

    // ---- 2. World manifest (characters + voices, props, locations) ----
    const manOut = await claude({
      system:
        "You are casting and world-building the ENTIRE recurring world of this " +
        "series so an AI pipeline can lock visual + audio consistency upfront. " +
        "From the premise and season map, list EVERY recurring character, every " +
        "important/recurring prop, and every recurring location.\n" +
        "For each CHARACTER: a short description (role in story, age, key traits) " +
        "PLUS a detailed_prompt — a rich photographic generation prompt covering " +
        "FULL BODY head-to-toe: face, skin, hair, build, wardrobe including shoes, " +
        "jewelry/accessories, posture, expression (style-agnostic: no medium/grade " +
        "words — the style guide is applied separately). PLUS a voice_profile: " +
        "tone, accent, pace, texture (e.g. 'warm low alto, Zulu-accented English, " +
        "measured and deliberate').\n" +
        "For each PROP and LOCATION: short description + a detailed_prompt of its " +
        "physical appearance. Keep the cast tight (5-15 characters). Return ONLY JSON.",
      user:
        `PREMISE:\n${proj.premise}\n\nMARKET: ${proj.market}\n` +
        `SEASON MAP (for who/what recurs):\n` +
        map.episodes.slice(0, 40).map(e => `${e.ep}. ${e.logline}`).join("\n") +
        `\n\nReturn JSON: {"characters":[{"name":str,"description":str,` +
        `"detailed_prompt":str,"voice_profile":str}],"props":[{"name":str,` +
        `"description":str,"detailed_prompt":str}],"locations":[{"name":str,` +
        `"description":str,"detailed_prompt":str}]}`,
      maxTokens: 8000,
    });
    const man = extractJson<Manifest>(manOut);

    // Insert manifest into the Bible (skip names that already exist).
    const { data: existing } = await sb.from("sr_assets")
      .select("name").eq("project_id", project_id);
    const have = new Set((existing ?? []).map(a => a.name.toLowerCase()));

    const rows: Record<string, unknown>[] = [];
    const push = (kind: string, items: (ManifestChar | ManifestItem)[]) =>
      items?.forEach((it, i) => {
        if (have.has(it.name.toLowerCase())) return;
        rows.push({
          project_id, kind, name: it.name, description: it.description,
          gen_prompt: it.detailed_prompt, ref_slot: i + 1, status: "draft",
          voice_profile: (it as ManifestChar).voice_profile ?? null,
        });
      });
    push("character", man.characters ?? []);
    push("prop", man.props ?? []);
    push("location", man.locations ?? []);
    if (rows.length) {
      const { error } = await sb.from("sr_assets").insert(rows);
      if (error) throw error;
    }

    await sb.from("sr_projects").update({ season_map: map.episodes }).eq("id", project_id);

    return json({
      episodes: map.episodes.length,
      characters: man.characters?.length ?? 0,
      props: man.props?.length ?? 0,
      locations: man.locations?.length ?? 0,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
