// sr-pitch-concepts — the very first step. Deep format understanding baked in:
// pitches 3 series concepts for the chosen market (optionally seeded with Jon's
// own research notes). User picks one -> it becomes the project's name + premise.
//
// POST { project_id, market?, research_notes? }  ->  { concepts: [3] }
import { CORS, json, preflight, serviceClient, claude, extractJson } from "../_shared/util.ts";

const PITCH_BRAIN = `
You are a development executive who deeply understands the vertical micro-drama
(duanju) format AND African television audiences. You pitch series for an
always-on AI production pipeline: 60-second episodes (4 x 15s shots), published
daily on YouTube/TikTok, never-ending serialized cliffhanger structure.

WHAT WORKS (apply ruthlessly):
- Proven duanju retention templates: secret heir/hidden billionaire, revenge &
  vindication, contract marriage, mistaken identity, hidden pregnancy, the
  underestimated one who is secretly powerful.
- Fused with the AFRICAN emotional engine (Nollywood-proven): the small house /
  co-wife war, lobola & inheritance betrayal, black tax and the discarded son who
  returns wealthy, ancestral curse / muthi revenge, pastor-scandal, family land wars.
- Melodrama, NOT action: betrayal, injustice, secret wealth, vindication. Two
  people in a room and one emotional detonation. Skews to women. Addictive.
- Every episode ends on a cliff; the story never resolves.
- Small recurring cast (5-15), few recurring locations — an AI pipeline must hold
  visual consistency, so concepts must be cast-tight and location-tight.

Ground each concept in the requested market's cultural specifics (names, settings,
customs, code-switching). Pitch like a human exec: sharp logline, why it will
hook, the engine that makes it infinite. Return ONLY JSON.`;

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
