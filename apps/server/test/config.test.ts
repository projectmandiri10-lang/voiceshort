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
  process.env.AIVENE_API_KEY = "test-aivene-key";
  process.env.AIVENE_BASE_URL = "https://api.aivene.test/v1";
  process.env.AI_PROVIDER = "aivene";
  process.env.SCRIPT_PROVIDER = "aivene";
  process.env.SCRIPT_FALLBACK_PROVIDER = "openrouter";
  process.env.AIVENE_SCRIPT_MODEL = "gemini-2.5-pro";
  process.env.TTS_PROVIDER = "aivene";
  process.env.TTS_FALLBACK_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
  process.env.AIVENE_TTS_MODEL = "tts-1-hd";
}

describe("env config", () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("defaults to aivene mode with the new env contract", () => {
    applyBaseEnv();

    const env = loadEnv();
    expect(env.aiProvider).toBe("aivene");
    expect(env.aiveneApiKey).toBe("test-aivene-key");
    expect(env.scriptProvider).toBe("aivene");
    expect(env.ttsProvider).toBe("aivene");
  });

  it("loads model envs", () => {
    applyBaseEnv();
    process.env.AIVENE_SCRIPT_MODEL = "gemini-2.5-pro";
    process.env.AIVENE_TTS_MODEL = "tts-1";

    const env = loadEnv();
    expect(env.scriptModel).toBe("gemini-2.5-pro");
    expect(env.ttsModel).toBe("tts-1");
    expect(env.successOutputRetentionHours).toBe(72);
  });

  it("throws a clear error when aivene api key is missing", () => {
    applyBaseEnv();
    process.env.AIVENE_API_KEY = "";

    expect(() => loadEnv()).toThrow("AIVENE_API_KEY wajib diisi");
  });

  it("throws a clear error when openrouter api key is missing", () => {
    applyBaseEnv();
    process.env.OPENROUTER_API_KEY = "";

    expect(() => loadEnv()).toThrow("OPENROUTER_API_KEY wajib diisi");
  });

  it("throws a clear error when fallback providers match the primary", () => {
    applyBaseEnv();
    process.env.SCRIPT_FALLBACK_PROVIDER = "aivene";

    expect(() => loadEnv()).toThrow("SCRIPT_FALLBACK_PROVIDER wajib berbeda dari SCRIPT_PROVIDER");
  });

  it("loads custom success output retention hours", () => {
    applyBaseEnv();
    process.env.SUCCESS_OUTPUT_RETENTION_HOURS = "96";

    const env = loadEnv();
    expect(env.successOutputRetentionHours).toBe(96);
  });

  it("throws a clear error when success output retention hours is invalid", () => {
    applyBaseEnv();
    process.env.SUCCESS_OUTPUT_RETENTION_HOURS = "0";

    expect(() => loadEnv()).toThrow("SUCCESS_OUTPUT_RETENTION_HOURS tidak valid");
  });
});
