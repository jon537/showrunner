// sr-breakdown — turn a 60s microdrama script into 4 x 15s beats, each bound to
// the characters/props/location it uses (from the project's Bible), with a
// Seedance-ready prompt per beat. Writes sr_episodes + 4 sr_shots.
//
// POST { script_id }  ->  { episode_id, shots: [...] }
import { CORS, json, preflight, serviceClient, claude, extractJson } from "../_shared/util.ts";

interface Beat {
  seq: number;
  beat_text: string;
  seedance_prompt: string;
  bound_asset_names: string[]; // names resolved to ids below
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { script_id } = await req.json();
    if (!script_id) return json({ error: "script_id required" }, 400);

    const sb = serviceClient();

    const { data: script, error: se } = await sb
      .from("sr_scripts").select("*").eq("id", script_id).single();
    if (se || !script) return json({ error: "script not found" }, 404);

    const { data: assets } = await sb
      .from("sr_assets").select("id,kind,name,description")
      .eq("project_id", script.project_id).eq("status", "ready");

    const bible = (assets ?? []).map(a =>
      `- [${a.kind}] ${a.name}: ${a.description ?? ""}`).join("\n");

    const system =
      "You are a microdrama director. Break a ~60 second script into EXACTLY 4 " +
      "beats of ~15 seconds each. Each beat becomes one Seedance clip. For every " +
      "beat write a vivid, self-contained visual prompt (camera, action, mood) " +
      "that CUTS CLEANLY at its edges (audio and visual) so the 4 clips join with " +
      "no seam. Only reference characters/props/locations that exist in the Bible, " +
      "by their exact names, and list them in bound_asset_names so the renderer " +
      "loads the right reference sheets. Return ONLY JSON.";

    const user =
      `BIBLE (only these may appear):\n${bible || "(none yet)"}\n\n` +
      `SCRIPT:\n${script.raw_text}\n\n` +
      `Return JSON: {"working_title": string, "beats": [` +
      `{"seq":1,"beat_text":string,"seedance_prompt":string,"bound_asset_names":[string]}` +
      `, ... exactly 4 ]}`;

    const out = await claude({ system, user, maxTokens: 3000 });
    const parsed = extractJson<{ working_title: string; beats: Beat[] }>(out);
    if (!parsed.beats || parsed.beats.length !== 4)
      return json({ error: "model did not return 4 beats", raw: out }, 422);

    // name -> id map for binding
    const byName = new Map((assets ?? []).map(a => [a.name.toLowerCase(), a.id]));

    const { data: ep, error: ee } = await sb.from("sr_episodes").insert({
      project_id: script.project_id,
      script_id,
      working_title: parsed.working_title,
      status: "shots_planned",
    }).select().single();
    if (ee) throw ee;

    const shots = parsed.beats.map(b => ({
      episode_id: ep.id,
      seq: b.seq,
      beat_text: b.beat_text,
      seedance_prompt: b.seedance_prompt,
      bound_asset_ids: (b.bound_asset_names ?? [])
        .map(n => byName.get(n.toLowerCase())).filter(Boolean),
    }));
    const { error: shErr } = await sb.from("sr_shots").insert(shots);
    if (shErr) throw shErr;

    await sb.from("sr_scripts").update({ status: "broken_down" }).eq("id", script_id);
    await sb.from("sr_events").insert({
      episode_id: ep.id, type: "breakdown", payload: { beats: shots.length },
    });

    return json({ episode_id: ep.id, working_title: parsed.working_title, shots });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
