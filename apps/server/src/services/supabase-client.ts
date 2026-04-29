import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
  accessToken?: string;
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient | undefined {
  if (!config.supabaseUrl || !config.supabaseKey) {
    return undefined;
  }

  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: config.accessToken
      ? {
          headers: {
            Authorization: `Bearer ${config.accessToken}`
          }
        }
      : undefined
  });
}
