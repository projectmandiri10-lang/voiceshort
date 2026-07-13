import { describe, expect, it } from "vitest";
import {
  AIVENE_TTS_VOICES,
  DEFAULT_AIVENE_SCRIPT_MODEL,
  DEFAULT_AIVENE_TTS_MODEL,
  DEFAULT_OPENROUTER_TTS_MODEL,
  DEFAULT_SETTINGS,
  OPENROUTER_TTS_VOICES,
  findTtsVoiceByName,
  normalizeScriptModel,
  normalizeScriptProvider,
  normalizeTtsModel,
  normalizeTtsProvider
} from "./constants";

describe("shared constants", () => {
  it("defaults script routing to aivene", () => {
    expect(DEFAULT_SETTINGS.scriptProvider).toBe("aivene");
    expect(DEFAULT_SETTINGS.scriptFallbackProvider).toBe("openrouter");
    expect(DEFAULT_SETTINGS.scriptModel).toBe(DEFAULT_AIVENE_SCRIPT_MODEL);
  });

  it("normalizes script models for aivene and openrouter", () => {
    expect(normalizeScriptModel("", "aivene")).toBe(DEFAULT_AIVENE_SCRIPT_MODEL);
    expect(normalizeScriptModel("google/gemini-2.5-flash", "aivene")).toBe("gemini-2.5-flash");
    expect(normalizeScriptModel("gemini/gemini-2.5-flash-lite", "openrouter")).toBe(
      "google/gemini-2.5-flash-lite"
    );
  });

  it("normalizes repeated Gemini prefixes across aivene and openrouter formats", () => {
    expect(normalizeScriptModel("gemini/gemini-3-flash-preview", "openrouter")).toBe(
      "google/gemini-3-flash-preview"
    );
    expect(normalizeScriptModel("gemini/gemini/gemini-3.1-pro-preview", "aivene")).toBe(
      "gemini-3.1-pro-preview"
    );
  });

  it("keeps provider validation split between script and tts", () => {
    expect(normalizeScriptProvider("aivene", "openrouter")).toBe("aivene");
    expect(normalizeTtsProvider("aivene", "openrouter")).toBe("aivene");
    expect(normalizeTtsModel("", "openrouter")).toBe(DEFAULT_OPENROUTER_TTS_MODEL);
    expect(normalizeTtsModel("", "aivene")).toBe(DEFAULT_AIVENE_TTS_MODEL);
    expect(normalizeTtsModel("gemini-2.5-pro-tts", "openrouter")).toBe(DEFAULT_OPENROUTER_TTS_MODEL);
  });

  it("keeps voice lookup provider and model aware", () => {
    expect(findTtsVoiceByName("nova", "aivene")).toEqual(AIVENE_TTS_VOICES.find((voice) => voice.voiceName === "nova"));
    expect(findTtsVoiceByName("Leda", "openrouter")).toEqual(
      OPENROUTER_TTS_VOICES.find((voice) => voice.voiceName === "Leda")
    );
    expect(findTtsVoiceByName("Leda", "aivene", "gemini-2.5-pro-tts")?.voiceName).toBe("leda");
    expect(findTtsVoiceByName("alloy", "aivene", "gemini-2.5-pro-tts")).toBeUndefined();
  });
});
