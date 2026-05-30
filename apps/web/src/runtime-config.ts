export interface RuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  apiBase?: string;
}

type RuntimeConfigHost = {
  __VOICESHORT_RUNTIME_CONFIG__?: RuntimeConfig;
};

function getRuntimeConfigHost(): RuntimeConfigHost | undefined {
  if (typeof window !== "undefined") {
    return window as Window & RuntimeConfigHost;
  }

  if (typeof globalThis !== "undefined") {
    return globalThis as typeof globalThis & RuntimeConfigHost;
  }

  return undefined;
}

export function getRuntimeConfig(): RuntimeConfig | undefined {
  return getRuntimeConfigHost()?.__VOICESHORT_RUNTIME_CONFIG__;
}
