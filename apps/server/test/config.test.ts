import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../src/config.js";

const ORIGINAL_ENV = { ...process.env };

function applyBaseEnv() {
  process.env.PORT = "8788";
  process.env.WEB_ORIGIN = "http://localhost:5174";
  process.env.SUPERADMIN_EMAIL = "admin@test.dev";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.GENERATE_PRICE_IDR = "2000";
}

describe("env config", () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("defaults to litellm mode when AI_PROVIDER is omitted", () => {
    applyBaseEnv();
    delete process.env.AI_PROVIDER;
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    const env = loadEnv();
    expect(env.aiProvider).toBe("litellm");
  });

  it("allows litellm mode without gemini api key", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "litellm";
    process.env.GEMINI_API_KEY = "";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    const env = loadEnv();
    expect(env.aiProvider).toBe("litellm");
    expect(env.geminiApiKey).toBe("");
    expect(env.litellmFileTargetModel).toBe("gemini/gemini-3-flash-preview");
  });

  it("throws a clear error when litellm base url is missing", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "litellm";
    process.env.GEMINI_API_KEY = "";
    process.env.LITELLM_BASE_URL = "";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    expect(() => loadEnv()).toThrow("LITELLM_BASE_URL wajib diisi");
  });

  it("still requires gemini api key in direct gemini mode", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "";

    expect(() => loadEnv()).toThrow("GEMINI_API_KEY");
  });
});
