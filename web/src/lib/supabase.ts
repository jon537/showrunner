import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// True only when both env vars were present at BUILD time (Vite bakes them in).
export const supabaseConfigured = Boolean(url && anon);

// Fall back to placeholders so createClient never throws at import (which would
// blank the whole app). App.tsx shows a clear message when not configured.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anon || "placeholder-anon-key",
);

// Call an edge function with the current user session attached.
// On failure, dig the real { error } message out of the function's response body
// (supabase-js hides it behind a generic "non-2xx" FunctionsHttpError otherwise).
export async function invoke<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const b = await ctx.clone().json();
        if (b?.error) detail = typeof b.error === "string" ? b.error : JSON.stringify(b.error);
      } catch { /* body wasn't JSON; keep generic message */ }
    }
    throw new Error(detail);
  }
  return data as T;
}
