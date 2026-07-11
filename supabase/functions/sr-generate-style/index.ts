// sr-generate-style — STEP 1. The AI enhancer for the series' look.
// Takes Jon's loose brief + aspect ratio, expands it into a detailed style guide
// (the "always-on" spec injected into every later generation), and renders a
// visual STYLE PLATE that anchors the look. Locks the style on the project.
//
// POST { project_id, style_brief, aspect_ratio }  ->  { style_guide, style_image_url }
import { CORS, json, preflight, serviceClient, claude, nanoBanana, uploadPublic } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { project_id, style_brief, aspect_ratio } = await req.json();
    if (!project_id || !style_brief) return json({ error: "project_id and style_brief required" }, 400);
    const aspect = aspect_ratio === "16:9" ? "16:9" : "9:16";

    const sb = serviceClient();

    // 1. AI enhancer: loose brief -> detailed, format-locked style guide.
    const style_guide = (await claude({
      system:
        "You are an art director defining the LOCKED visual style for an entire " +
        "animated/video series. Expand the user's brief into a precise, reusable " +
        "style guide that will be prepended to every character, prop, and location " +
        "prompt. Cover: medium/rendering (e.g. photoreal, 2D cel, 3D, painterly), " +
        "line & shading, color palette & grade, lighting, texture/detail level, " +
        "camera/lens feel, and overall mood. Be specific and directive. Output the " +
        "guide as tight prose (no headings, no preamble), and END with one line: " +
        `\"Aspect ratio: ${aspect} — compose all frames for this.\"`,
      user: `BRIEF: ${style_brief}\nASPECT: ${aspect}\n\nWrite the style guide.`,
      maxTokens: 700,
    })).trim();

    // 2. Style plate — a representative image that visually anchors the look.
    const platePrompt =
      `${style_guide}\n\nRender a single STYLE PLATE that exemplifies this exact ` +
      `visual style: a representative establishing frame (a character or scene in ` +
      `this world). Composition must be ${aspect} ` +
      `${aspect === "9:16" ? "vertical portrait" : "horizontal landscape"}. ` +
      `This image defines the look every future render must match.`;
    const bytes = await nanoBanana(platePrompt);
    const style_image_url = await uploadPublic(
      sb, `${project_id}/style/plate.png`, bytes, "image/png",
    );

    // 3. Lock it on the project.
    await sb.from("sr_projects").update({
      style_brief, style_guide, style_image_url, aspect_ratio: aspect, style_locked: true,
    }).eq("id", project_id);

    return json({ style_guide, style_image_url, aspect_ratio: aspect });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
