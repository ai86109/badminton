import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * When the Supabase env vars are present we run in "cloud" mode (login + sync).
 * When they're absent (e.g. a quick local preview) `supabase` is null and the
 * app falls back to localStorage so it still works offline.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
