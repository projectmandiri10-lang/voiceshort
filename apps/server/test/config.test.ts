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
  // Pastikan test tidak "ketularan" nilai dari file .env repo.
  process.env.LITELLM_FILE_TARGET_MODEL = "";
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

  it("loads litellm mode without direct gemini credentials", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "litellm";
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    const env = loadEnv();
    expect(env.aiProvider).toBe("litellm");
    expect(env.litellmFileTargetModel).toBe("gemini/gemini-3-flash-preview");
    expect(env.successOutputRetentionHours).toBe(72);
  });

  it("normalizes litellm base url from env", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "litellm";
    process.env.LITELLM_BASE_URL = "https://litellm.koboi2026.biz.id/v1/";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    const env = loadEnv();
    expect(env.litellmBaseUrl).toBe("https://litellm.koboi2026.biz.id");
  });

  it("throws a clear error when litellm base url is missing", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "litellm";
    process.env.LITELLM_BASE_URL = "";
    process.env.LITELLM_SCRIPT_MODEL = "gemini/gemini-3-flash-preview";
    process.env.LITELLM_TTS_MODEL = "gemini/gemini-2.5-pro-preview-tts";

    expect(() => loadEnv()).toThrow("LITELLM_BASE_URL wajib diisi");
  });

  it("rejects non-litellm provider modes", () => {
    applyBaseEnv();
    process.env.AI_PROVIDER = "gemini";

    expect(() => loadEnv()).toThrow("hanya mendukung litellm");
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
