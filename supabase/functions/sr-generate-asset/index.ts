// sr-generate-asset — Bible builder (Phase 1A). For one character/prop/location:
//   1. ENFORCE the project style is locked (Step 1 must be done first).
//   2. AI enhancer: Claude writes a detailed prompt = STYLE GUIDE + this asset.
//   3. Nano Banana renders it, WITH THE STYLE PLATE injected as a reference image
//      so every asset shares the exact same look + aspect ratio.
//
// POST { asset_id, regenerate?: boolean }  ->  { asset_id, prompt, image_url }
import {
  CORS, json, preflight, serviceClient, claude, nanoBanana, uploadPublic, fetchImageB64,
} from "../_shared/util.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { asset_id, regenerate } = await req.json();
    if (!asset_id) return json({ error: "asset_id required" }, 400);

    const sb = serviceClient();
    const { data: asset, error } = await sb
      .from("sr_assets")
      .select("*, sr_projects(style_guide, style_image_url, aspect_ratio, style_locked)")
      .eq("id", asset_id).single();
    if (error || !asset) return json({ error: "asset not found" }, 404);

    const proj = asset.sr_projects;
    if (!proj?.style_locked) {
      return json({ error: "Set the series STYLE first (Step 1) — nothing can be generated until the style is locked." }, 400);
    }
    const aspect = proj.aspect_ratio === "16:9" ? "16:9" : "9:16";

    await sb.from("sr_assets").update({ status: "generating" }).eq("id", asset_id);

    // 1. AI enhancer: detailed, style-locked prompt for this asset.
    let prompt = asset.gen_prompt;
    if (!prompt || regenerate) {
      prompt = (await claude({
        system:
          "You write a single image-generation prompt for ONE reference sheet " +
          "(character, prop, or location) that MUST obey the series style guide " +
          "verbatim. Show the subject clearly for use as a video reference: a " +
          "character from multiple angles with consistent wardrobe; a prop/location " +
          "from a clear representative angle. Neutral background. Output ONE prompt, " +
          "no preamble. The style guide is authoritative — do not deviate.",
        user:
          `STYLE GUIDE (authoritative):\n${proj.style_guide}\n\n` +
          `ASPECT: ${aspect}\nKIND: ${asset.kind}\nNAME: ${asset.name}\n` +
          `DETAILS: ${asset.description ?? ""}\n\nWrite the reference-sheet prompt.`,
        maxTokens: 500,
      })).trim();
    }

    // 2. Render WITH the style plate as a visual reference (the consistency lock).
    const refs = proj.style_image_url ? [await fetchImageB64(proj.style_image_url)] : [];
    const fullPrompt =
      `${prompt}\n\nMatch the visual style of the provided reference image exactly ` +
      `(medium, palette, line, lighting). Composition ${aspect}.`;
    const bytes = await nanoBanana(fullPrompt, refs);

    const image_url = await uploadPublic(
      sb, `${asset.project_id}/bible/${asset.kind}/${asset_id}.png`, bytes, "image/png",
    );

    const existing = Array.isArray(asset.reference_image_urls) ? asset.reference_image_urls : [];
    await sb.from("sr_assets").update({
      gen_prompt: prompt,
      reference_image_urls: [...new Set([image_url, ...existing])],
      status: "ready",
    }).eq("id", asset_id);

    return json({ asset_id, prompt, image_url });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
