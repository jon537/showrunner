// sr-generate-options — CASTING. Render N (default 4) distinct candidate looks
// for a character/prop/location, all in the locked style. Options accumulate so
// "generate 4 more" keeps adding. Pick one later, then build the sheet from it.
//
// POST { asset_id, n?: number }  ->  { options: [newUrls] }
import {
  CORS, json, preflight, serviceClient, claude, nanoBanana, uploadPublic, fetchImageB64,
} from "../_shared/util.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { asset_id, n } = await req.json();
    if (!asset_id) return json({ error: "asset_id required" }, 400);
    const count = Math.min(Math.max(Number(n) || 4, 1), 4);

    const sb = serviceClient();
    const { data: asset, error } = await sb
      .from("sr_assets")
      .select("*, sr_projects(style_guide, style_image_url, aspect_ratio, style_locked)")
      .eq("id", asset_id).single();
    if (error || !asset) return json({ error: "asset not found" }, 404);

    const proj = asset.sr_projects;
    if (!proj?.style_locked)
      return json({ error: "Set the series STYLE first (Step 1)." }, 400);
    const aspect = proj.aspect_ratio === "16:9" ? "16:9" : "9:16";

    await sb.from("sr_assets").update({ status: "casting" }).eq("id", asset_id);

    // Base enhanced prompt for this subject (cached on the asset).
    let prompt = asset.gen_prompt;
    if (!prompt) {
      prompt = (await claude({
        system:
          "You write a single image prompt for ONE subject (character, prop, or " +
          "location) that obeys the series style guide verbatim. For a character: a " +
          "clear single-subject portrait/full-body in-world. For a prop/location: a " +
          "clean representative shot. Output ONE prompt, no preamble.",
        user:
          `STYLE GUIDE (authoritative):\n${proj.style_guide}\n\nASPECT: ${aspect}\n` +
          `KIND: ${asset.kind}\nNAME: ${asset.name}\nDETAILS: ${asset.description ?? ""}\n\n` +
          `Write the prompt.`,
        maxTokens: 400,
      })).trim();
    }

    const refs = proj.style_image_url ? [await fetchImageB64(proj.style_image_url)] : [];
    const existing: string[] = Array.isArray(asset.options) ? asset.options : [];
    const start = existing.length;

    const newUrls = await Promise.all(
      Array.from({ length: count }, (_v, i) => (async () => {
        const p =
          `${prompt}\n\nThis is a DISTINCT casting option — a fresh, different ` +
          `interpretation/face from the others. Match the reference image's visual ` +
          `style exactly. Composition ${aspect}.`;
        const bytes = await nanoBanana(p, refs);
        return await uploadPublic(
          sb, `${asset.project_id}/bible/${asset.kind}/${asset_id}/opt-${start + i}.png`,
          bytes, "image/png",
        );
      })()),
    );

    const options = [...existing, ...newUrls];
    await sb.from("sr_assets").update({ options, gen_prompt: prompt, status: "casting" })
      .eq("id", asset_id);

    return json({ options: newUrls });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
