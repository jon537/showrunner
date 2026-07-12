// sr-generate-sheet — build the multi-angle REFERENCE SHEET from the chosen look.
// Uses the approved option image as the primary reference (so the sheet IS that
// exact subject) + the style plate. This sheet is what the renderer binds into
// Seedance later. Marks the asset 'ready'.
//
// POST { asset_id }  ->  { sheet_url }
import {
  CORS, json, preflight, serviceClient, nanoBanana, uploadPublic, fetchImageB64,
} from "../_shared/util.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { asset_id } = await req.json();
    if (!asset_id) return json({ error: "asset_id required" }, 400);

    const sb = serviceClient();
    const { data: asset, error } = await sb
      .from("sr_assets")
      .select("*, sr_projects(style_image_url, aspect_ratio, style_locked)")
      .eq("id", asset_id).single();
    if (error || !asset) return json({ error: "asset not found" }, 404);
    if (!asset.chosen_image_url)
      return json({ error: "Pick a look first — choose one of the casting options." }, 400);

    const proj = asset.sr_projects;
    const aspect = proj?.aspect_ratio === "16:9" ? "16:9" : "9:16";

    // First reference = the chosen subject; second = the style plate.
    const refs = [await fetchImageB64(asset.chosen_image_url)];
    if (proj?.style_image_url) refs.push(await fetchImageB64(proj.style_image_url));

    const angles = asset.kind === "character"
      ? "FULL BODY head-to-toe front view, full body 3/4 view, full body profile, " +
        "and back view, PLUS a face close-up panel. Show complete wardrobe including " +
        "shoes, full hairstyle, jewelry/accessories and hands — every detail visible " +
        "and identical across all panels"
      : "several clear representative angles plus a detail close-up";
    const hasPlate = refs.length > 1;
    const prompt =
      `Create a REFERENCE / TURNAROUND SHEET of a ${asset.kind}. ` +
      `SUBJECT: take the identity/design/wardrobe/colors from the FIRST reference ` +
      `image and keep them the same across all angles. ` +
      (hasPlate
        ? `STYLE: RE-RENDER that subject in the visual style of the SECOND reference ` +
          `image (the style plate) — its medium, palette, line, shading and lighting. ` +
          `If the first image is in a different style, the SECOND image's style wins; ` +
          `translate the subject into that style while preserving who/what it is. `
        : ``) +
      `Lay it out as ${angles} on a clean neutral background, evenly lit and ` +
      `consistent across all angles. Composition ${aspect}. This sheet is the ` +
      `canonical reference for video generation.`;

    const bytes = await nanoBanana(prompt, refs);
    const sheet_url = await uploadPublic(
      sb, `${asset.project_id}/bible/${asset.kind}/${asset_id}/sheet.png`, bytes, "image/png",
    );

    await sb.from("sr_assets").update({
      reference_image_urls: [sheet_url], status: "ready",
    }).eq("id", asset_id);

    return json({ sheet_url });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
