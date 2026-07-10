// sr-render — render the 4 shots of an episode through Seedance (Higgsfield),
// binding each shot's reference sheets into Seedance's reference slots.
//
// POST { episode_id }  ->  { episode_id, mode, shots: [...] }
//
// ⚠ SPIKE H DECIDES THE MODE (see the build plan, Q5):
//   - If the Higgsfield/Seedance API accepts multiple reference images
//     programmatically, implement submitRender() and this fully automates.
//   - If it does NOT (binding is a manual UI action today), leave MODE='prep':
//     this function assembles the exact refs + prompt per shot and marks them
//     'ready for manual render', and an operator runs them in the Seedance UI.
// Either way the binding logic below (right refs -> right shot) is the payload.
import { CORS, json, preflight, serviceClient } from "../_shared/util.ts";

const MODE = Deno.env.get("RENDER_MODE") ?? "prep"; // 'prep' | 'api'

async function submitRender(_prompt: string, _refImageUrls: string[]): Promise<{ jobId: string }> {
  // TODO(Spike H): call Higgsfield/Seedance with the prompt + ordered reference
  // images loaded into slots (image 1 = first ref, ...). Return the job id.
  // Endpoint + auth via HIGGSFIELD_API_KEY once confirmed against the live API.
  throw new Error("RENDER_MODE=api not implemented yet — confirm the API in Spike H");
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { episode_id } = await req.json();
    if (!episode_id) return json({ error: "episode_id required" }, 400);

    const sb = serviceClient();
    const { data: shots, error } = await sb
      .from("sr_shots").select("*").eq("episode_id", episode_id).order("seq");
    if (error) throw error;
    if (!shots?.length) return json({ error: "no shots" }, 404);

    // Resolve each shot's bound assets -> ordered reference image URLs (the slots).
    const results = [];
    for (const shot of shots) {
      const ids = (shot.bound_asset_ids ?? []) as string[];
      const { data: assets } = await sb
        .from("sr_assets").select("name,ref_slot,reference_image_urls")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const refs = (assets ?? [])
        .sort((a, b) => (a.ref_slot ?? 99) - (b.ref_slot ?? 99))
        .map(a => (a.reference_image_urls?.[0]))
        .filter(Boolean) as string[];

      if (MODE === "api") {
        const { jobId } = await submitRender(shot.seedance_prompt, refs);
        await sb.from("sr_shots").update({ render_job_id: jobId, render_status: "rendering" })
          .eq("id", shot.id);
        results.push({ seq: shot.seq, mode: "api", jobId, refs });
      } else {
        // prep mode: hand the operator everything to render in one click
        results.push({
          seq: shot.seq,
          mode: "prep",
          prompt: shot.seedance_prompt,
          slots: refs,               // image 1..N in order
          beat: shot.beat_text,
        });
      }
    }

    await sb.from("sr_episodes")
      .update({ status: MODE === "api" ? "rendering" : "shots_planned" })
      .eq("id", episode_id);
    await sb.from("sr_events").insert({ episode_id, type: "render", payload: { mode: MODE } });

    return json({ episode_id, mode: MODE, shots: results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
