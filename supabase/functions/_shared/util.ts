// Shared helpers for Showrunner edge functions (Deno).
import { createClient } from "npm:@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return null;
}

// Service-role client — full DB access from inside an edge function.
export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Anthropic Messages API. Model is env-driven so you can swap tiers per cost.
export async function claude(opts: {
  system?: string;
  user: string;
  maxTokens?: number;
  images?: { mediaType: string; dataB64: string }[];
}): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

  const content: unknown[] = [{ type: "text", text: opts.user }];
  for (const img of opts.images ?? []) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.dataB64 },
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2048,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
}

// Pull the first JSON object/array out of a model response (handles ```json fences).
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found in model output");
  return JSON.parse(raw.slice(start)) as T;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Fetch an image URL and return { mimeType, b64 } — used to pass the style plate
// as a reference into subsequent generations.
export async function fetchImageB64(url: string): Promise<{ mimeType: string; b64: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { mimeType, b64: btoa(bin) };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Nano Banana (Gemini image). Optional reference images are passed as inlineData
// parts — this is how the project's STYLE PLATE gets injected into every render
// so characters/props/locations all share one look. Returns PNG bytes.
// Retries transient 5xx / 429 (image gen throws these intermittently).
export async function nanoBanana(
  prompt: string,
  refs: { mimeType: string; b64: string }[] = [],
): Promise<Uint8Array> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = Deno.env.get("NANO_BANANA_MODEL") ?? "gemini-2.5-flash-image";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const parts: unknown[] = [{ text: prompt }];
  for (const r of refs) parts.push({ inlineData: { mimeType: r.mimeType, data: r.b64 } });
  const body = JSON.stringify({ contents: [{ parts }] });

  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      const outParts = data?.candidates?.[0]?.content?.parts ?? [];
      const img = outParts.find((p: { inlineData?: { data: string } }) => p.inlineData)?.inlineData?.data;
      if (img) return b64ToBytes(img);
      // No image (often a safety block or empty candidate) — retry once or two.
      last = "no image in Nano Banana response";
    } else {
      last = `Nano Banana ${res.status}: ${await res.text()}`;
      // Only retry transient server/rate errors; fail fast on 4xx client errors.
      if (res.status < 500 && res.status !== 429) throw new Error(last);
    }
    await sleep(700 * (attempt + 1));
  }
  throw new Error(last || "Nano Banana failed after retries");
}

// Upload bytes to the public 'showrunner' bucket, return the public URL.
export async function uploadPublic(
  sb: ReturnType<typeof serviceClient>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await sb.storage
    .from("showrunner")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return sb.storage.from("showrunner").getPublicUrl(path).data.publicUrl;
}
