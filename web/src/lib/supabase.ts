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
export async function invoke<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}
