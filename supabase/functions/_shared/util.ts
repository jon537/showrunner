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
