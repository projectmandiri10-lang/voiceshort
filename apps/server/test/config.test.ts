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
    expect(env.successOutputRetentionHours).toBe(72);
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

  it("loads hybrid mode with Snifox for non-TTS and LiteLLM for TTS", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "hybrid";
    process.env.SNIFOX_API_BASE = "http://127.0.0.1:8000";
    process.env.SNIFOX_API_KEY = "snifox-key";
    process.env.SNIFOX_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_SECRET_KEY = "litellm-secret";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    const env = loadEnv();
    expect(env.aiProvider).toBe("hybrid");
    expect(env.snifoxApiBase).toBe("http://127.0.0.1:8000");
    expect(env.snifoxApiKey).toBe("snifox-key");
    expect(env.snifoxScriptModel).toBe("gemini/gemini-3-flash-preview");
    expect(env.litellmApiKey).toBe("litellm-secret");
    expect(env.litellmTtsModel).toBe("gemini/gemini-2.5-pro-preview-tts");
  });

  it("throws a clear error when hybrid snifox base url is missing", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "hybrid";
    process.env.SNIFOX_API_BASE = "";
    process.env.SNIFOX_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    expect(() => loadEnv()).toThrow("SNIFOX_API_BASE wajib diisi");
  });

  it("throws a clear error when hybrid snifox script model is missing", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "hybrid";
    process.env.SNIFOX_API_BASE = "http://127.0.0.1:8000";
    process.env.SNIFOX_SCRIPT_MODEL = "";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    expect(() => loadEnv()).toThrow("SNIFOX_SCRIPT_MODEL wajib diisi");
  });

  it("throws a clear error when hybrid litellm base url is missing", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "hybrid";
    process.env.SNIFOX_API_BASE = "http://127.0.0.1:8000";
    process.env.SNIFOX_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_BASE_URL = "";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    expect(() => loadEnv()).toThrow("LITELLM_BASE_URL wajib diisi");
  });

  it("throws a clear error when hybrid litellm tts model is missing", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "hybrid";
    process.env.SNIFOX_API_BASE = "http://127.0.0.1:8000";
    process.env.SNIFOX_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_TTS_MODEL = "";

    expect(() => loadEnv()).toThrow("LITELLM_TTS_MODEL wajib diisi");
  });

  it("loads custom success output retention hours", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "litellm";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";
    process.env.SUCCESS_OUTPUT_RETENTION_HOURS = "96";

    const env = loadEnv();
    expect(env.successOutputRetentionHours).toBe(96);
  });

  it("throws a clear error when success output retention hours is invalid", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "litellm";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";
    process.env.SUCCESS_OUTPUT_RETENTION_HOURS = "0";

    expect(() => loadEnv()).toThrow("SUCCESS_OUTPUT_RETENTION_HOURS tidak valid");
  });
});
