// sr-generate-asset — the SETUP step (Phase 1A). For one Bible asset:
//   1. Claude writes a style-locked image prompt (if not supplied)
//   2. Nano Banana (Gemini image) renders the reference sheet
//   3. store the sheet in the bucket + mark the asset 'ready'
//
// POST { asset_id, regenerate?: boolean }  ->  { asset_id, prompt, image_url }
//
// NOTE: "Nano Banana" == Gemini image model. Endpoint/model id are env-driven so
// you can point this at Google's Generative Language API or Higgsfield's Nano
// Banana, whichever you settle on. Confirm the exact response shape in setup.
import { CORS, json, preflight, serviceClient, claude, uploadPublic } from "../_shared/util.ts";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Gemini image generation (Nano Banana). Returns base64 PNG.
async function nanoBanana(prompt: string): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = Deno.env.get("NANO_BANANA_MODEL") ?? "gemini-2.5-flash-image";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Nano Banana ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: { inlineData?: { data: string } }) => p.inlineData)?.inlineData?.data;
  if (!img) throw new Error("no image in Nano Banana response");
  return img;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { asset_id, regenerate } = await req.json();
    if (!asset_id) return json({ error: "asset_id required" }, 400);

    const sb = serviceClient();
    const { data: asset, error } = await sb
      .from("sr_assets").select("*, sr_projects(style_note)").eq("id", asset_id).single();
    if (error || !asset) return json({ error: "asset not found" }, 404);

    await sb.from("sr_assets").update({ status: "generating" }).eq("id", asset_id);

    // 1. style-locked prompt (reuse stored one unless regenerating)
    let prompt = asset.gen_prompt;
    if (!prompt || regenerate) {
      const style = asset.sr_projects?.style_note ?? "";
      prompt = await claude({
        system:
          "You write image-generation prompts for a character/prop/location " +
          "reference sheet. Output ONE prompt only, no preamble. Describe a clean " +
          "reference sheet: the subject from multiple angles, consistent wardrobe/" +
          "design, neutral background, so it can anchor a video model's appearance.",
        user:
          `SERIES STYLE: ${style}\nKIND: ${asset.kind}\nNAME: ${asset.name}\n` +
          `DETAILS: ${asset.description ?? ""}\n\nWrite the reference-sheet prompt.`,
        maxTokens: 500,
      });
      prompt = prompt.trim();
    }

    // 2. render the sheet
    const imgB64 = await nanoBanana(prompt);
    const bytes = b64ToBytes(imgB64);

    // 3. store + mark ready
    const path = `${asset.project_id}/bible/${asset.kind}/${asset_id}.png`;
    const image_url = await uploadPublic(sb, path, bytes, "image/png");

    const refs = Array.isArray(asset.reference_image_urls) ? asset.reference_image_urls : [];
    await sb.from("sr_assets").update({
      gen_prompt: prompt,
      reference_image_urls: [...new Set([image_url, ...refs])],
      status: "ready",
    }).eq("id", asset_id);

    return json({ asset_id, prompt, image_url });
  } catch (e) {
    // best-effort: leave the asset visible for retry
    return json({ error: String(e) }, 500);
  }
});
