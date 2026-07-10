import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env");
}

export const supabase = createClient(url, anon);

// Call an edge function with the current user session attached.
export async function invoke<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}
