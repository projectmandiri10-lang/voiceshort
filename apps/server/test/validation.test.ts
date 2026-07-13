import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/constants.js";
import { parseJobCreateInput, parseSettings, parseTtsPreviewInput } from "../src/validation.js";

describe("validation", () => {
  it("parses settings with ordered gender voices", () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      genderVoices: [...DEFAULT_SETTINGS.genderVoices].reverse()
    });

    expect(parsed.genderVoices[0]?.gender).toBe("male");
    expect(parsed.genderVoices[1]?.gender).toBe("female");
  });

  it("normalizes provider-aware models for aivene and openrouter", () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      scriptProvider: "aivene",
      scriptFallbackProvider: "openrouter",
      scriptModel: "google/gemini-2.5-pro",
      ttsProvider: "aivene",
      ttsFallbackProvider: "openrouter",
      ttsModel: "google/gemini-3.1-flash-tts-preview"
    });

    expect(parsed.scriptModel).toBe("gemini-2.5-pro");
    expect(parsed.ttsModel).toBe("tts-1-hd");
  });

  it("rejects identical primary and fallback providers", () => {
    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        scriptProvider: "aivene",
        scriptFallbackProvider: "aivene"
      })
    ).toThrow(/fallback provider script/i);
  });

  it("rejects settings above hard max 60 seconds", () => {
    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        maxVideoSeconds: 61
      })
    ).toThrow();
  });

  it("accepts decimal tax rate and rejects values above 100", () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      taxRatePercent: 11.25
    });

    expect(parsed.taxRatePercent).toBe(11.25);

    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        taxRatePercent: 100.01
      })
    ).toThrow();
  });

  it("parses general job input and normalizes optional text", () => {
    const parsed = parseJobCreateInput({
      title: "Judul",
      description: "Brief singkat",
      contentType: "video-marketing",
      socialPlatform: "tiktok",
      voiceGender: "male",
      tone: "informatif",
      ctaText: "  ",
      referenceLink: " https://contoh.test/ref "
    });

    expect(parsed.contentType).toBe("video-marketing");
    expect(parsed.socialPlatform).toBe("tiktok");
    expect(parsed.voiceGender).toBe("male");
    expect(parsed.ctaText).toBeUndefined();
    expect(parsed.referenceLink).toBe("https://contoh.test/ref");
  });

  it("accepts supported preview content languages and rejects unsupported ones", () => {
    const parsed = parseTtsPreviewInput({
      voiceName: "nova",
      speechRate: 1,
      contentLanguage: "en-US"
    });

    expect(parsed.contentLanguage).toBe("en-US");

    expect(() =>
      parseTtsPreviewInput({
        voiceName: "nova",
        speechRate: 1,
        contentLanguage: "fr-FR"
      })
    ).toThrow();
  });
});
