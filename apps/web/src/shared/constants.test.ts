import { describe, expect, it } from "vitest";
import {
  DEFAULT_AIVENE_SCRIPT_MODEL,
  DEFAULT_SETTINGS,
  normalizeScriptModel,
  normalizeScriptProvider
} from "./constants";

describe("shared constants", () => {
  it("uses Aivene as the only default text provider", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      scriptProvider: "aivene",
      scriptFallbackProvider: "aivene",
      scriptModel: DEFAULT_AIVENE_SCRIPT_MODEL
    });
  });

  it("normalizes models for each text provider", () => {
    expect(normalizeScriptModel("", "aivene")).toBe(DEFAULT_AIVENE_SCRIPT_MODEL);
    expect(normalizeScriptModel("google/gemini-2.5-flash", "aivene")).toBe("gemini-2.5-flash");
    expect(normalizeScriptModel("", "zai")).toBe(DEFAULT_AIVENE_SCRIPT_MODEL);
    expect(normalizeScriptModel("custom-text-model", "zai")).toBe("custom-text-model");
  });

  it("rejects removed provider names", () => {
    expect(normalizeScriptProvider("aivene", "zai")).toBe("aivene");
    expect(normalizeScriptProvider("litellm", "zai")).toBe("zai");
    expect(normalizeScriptProvider("gemini_direct", "aivene")).toBe("aivene");
  });
});
