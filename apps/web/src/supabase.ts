import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "./runtime-config";

const runtimeConfig = getRuntimeConfig();
const supabaseUrl =
  runtimeConfig?.supabaseUrl?.trim() || import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const supabaseAnonKey =
  runtimeConfig?.supabaseAnonKey?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce",
          persistSession: true
        }
      })
    : undefined;

export function isSupabaseAuthReady(): boolean {
  return Boolean(supabase);
}
