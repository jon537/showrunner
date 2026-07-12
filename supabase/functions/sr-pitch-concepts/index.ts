// sr-pitch-concepts — the very first step. Deep format understanding baked in:
// pitches 3 series concepts for the chosen market (optionally seeded with Jon's
// own research notes). User picks one -> it becomes the project's name + premise.
//
// POST { project_id, market?, research_notes? }  ->  { concepts: [3] }
import { CORS, json, preflight, serviceClient, claude, extractJson } from "../_shared/util.ts";
import { PITCH_BRAIN } from "../_shared/format.ts";


Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { project_id, market, research_notes } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const sb = serviceClient();
    const { data: proj } = await sb.from("sr_projects").select("market").eq("id", project_id).single();
    const mkt = market || proj?.market || "South Africa";

    const user =
      `MARKET: ${mkt}\n` +
      (research_notes ? `MY RESEARCH / NOTES (weigh heavily):\n${research_notes}\n` : "") +
      `\nPitch EXACTLY 3 distinct series concepts. Return JSON:\n` +
      `{"concepts":[{"title":str,"logline":str,"engine":str (the infinite serial engine),` +
      `"why_it_works":str,"core_cast":[str short character taglines],"tone":str}]}`;

    const out = await claude({ system: PITCH_BRAIN, user, maxTokens: 2500 });
    const parsed = extractJson<{ concepts: unknown[] }>(out);
    if (!parsed.concepts?.length) return json({ error: "no concepts returned", raw: out }, 422);

    return json(parsed);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
