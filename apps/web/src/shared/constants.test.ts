import { describe, expect, it } from "vitest";
import {
  DEFAULT_AIVENE_SCRIPT_MODEL,
  DEFAULT_OPENROUTER_SCRIPT_MODEL,
  DEFAULT_SETTINGS,
  normalizeScriptModel,
  normalizeScriptProvider
} from "./constants";

describe("shared constants", () => {
  it("uses Aivene with OpenRouter fallback", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      scriptProvider: "aivene",
      scriptFallbackProvider: "openrouter",
      scriptModel: DEFAULT_AIVENE_SCRIPT_MODEL
    });
  });

  it("normalizes models for each text provider", () => {
    expect(normalizeScriptModel("", "aivene")).toBe(DEFAULT_AIVENE_SCRIPT_MODEL);
    expect(normalizeScriptModel("google/gemini-2.5-flash", "aivene")).toBe("gemini-2.5-flash");
    expect(normalizeScriptModel("", "openrouter")).toBe(DEFAULT_OPENROUTER_SCRIPT_MODEL);
    expect(normalizeScriptModel("gemini/gemini-2.5-flash", "openrouter")).toBe(
      "google/gemini-2.5-flash"
    );
  });

  it("rejects removed provider names", () => {
    expect(normalizeScriptProvider("aivene", "openrouter")).toBe("aivene");
    expect(normalizeScriptProvider("litellm", "openrouter")).toBe("openrouter");
    expect(normalizeScriptProvider("gemini_direct", "aivene")).toBe("aivene");
  });
});
