import { describe, expect, it } from "vitest";
import {
  DEFAULT_LITELLM_TTS_MODEL,
  DEFAULT_LITELLM_SCRIPT_MODEL,
  DEFAULT_OPENROUTER_TTS_MODEL,
  DEFAULT_SETTINGS,
  normalizeScriptModel,
  normalizeScriptProvider,
  normalizeTtsModel,
  normalizeTtsProvider
} from "./constants";

describe("shared constants", () => {
  it("defaults script routing to litellm", () => {
    expect(DEFAULT_SETTINGS.scriptProvider).toBe("litellm");
    expect(DEFAULT_SETTINGS.scriptFallbackProvider).toBe("openrouter");
    expect(DEFAULT_SETTINGS.scriptModel).toBe(DEFAULT_LITELLM_SCRIPT_MODEL);
  });

  it("normalizes Gemini slugs for litellm script models", () => {
    expect(normalizeScriptModel("gemini-2.5-flash-lite", "litellm")).toBe(
      "gemini/gemini-2.5-flash-lite"
    );
    expect(normalizeScriptModel("google/gemini-2.5-flash-lite", "litellm")).toBe(
      "gemini/gemini-2.5-flash-lite"
    );
    expect(normalizeScriptModel("", "litellm")).toBe(DEFAULT_LITELLM_SCRIPT_MODEL);
  });

  it("keeps provider validation split between script and tts", () => {
    expect(normalizeScriptProvider("litellm", "gemini_direct")).toBe("litellm");
    expect(normalizeTtsProvider("litellm", "openrouter")).toBe("litellm");
    expect(normalizeTtsModel("", "openrouter")).toBe(DEFAULT_OPENROUTER_TTS_MODEL);
    expect(normalizeTtsModel("", "litellm")).toBe(DEFAULT_LITELLM_TTS_MODEL);
    expect(normalizeTtsModel("google/gemini-3.1-flash-tts-preview", "litellm")).toBe(
      DEFAULT_LITELLM_TTS_MODEL
    );
  });
});
