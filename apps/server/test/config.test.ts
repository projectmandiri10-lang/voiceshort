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
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_SCRIPT_MODEL = "gemini-2.5-flash-lite";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
}

describe("env config", () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("defaults to gemini mode with the new env contract", () => {
    applyBaseEnv();

    const env = loadEnv();
    expect(env.aiProvider).toBe("gemini");
    expect(env.geminiApiKey).toBe("test-gemini-key");
  });

  it("loads model envs", () => {
    applyBaseEnv();
    process.env.GEMINI_SCRIPT_MODEL = "gemini-3.5-flash";
    process.env.OPENROUTER_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";

    const env = loadEnv();
    expect(env.geminiScriptModel).toBe("gemini-3.5-flash");
    expect(env.openrouterTtsModel).toBe("google/gemini-3.1-flash-tts-preview");
    expect(env.successOutputRetentionHours).toBe(72);
  });

  it("throws a clear error when gemini api key is missing", () => {
    applyBaseEnv();
    process.env.GEMINI_API_KEY = "";

    expect(() => loadEnv()).toThrow("GEMINI_API_KEY wajib diisi");
  });

  it("throws a clear error when gemini script model is missing", () => {
    applyBaseEnv();
    process.env.GEMINI_SCRIPT_MODEL = "";

    expect(() => loadEnv()).toThrow("GEMINI_SCRIPT_MODEL wajib diisi");
  });

  it("throws a clear error when openrouter api key is missing", () => {
    applyBaseEnv();
    process.env.OPENROUTER_API_KEY = "";

    expect(() => loadEnv()).toThrow("OPENROUTER_API_KEY wajib diisi");
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
