import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/constants.js";
import { parseJobCreateInput, parseSettings } from "../src/validation.js";

describe("validation", () => {
  it("parses settings with ordered gender voices", () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      genderVoices: [...DEFAULT_SETTINGS.genderVoices].reverse()
    });

    expect(parsed.genderVoices[0]?.gender).toBe("male");
    expect(parsed.genderVoices[1]?.gender).toBe("female");
  });

  it("rejects settings above hard max 60 seconds", () => {
    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        maxVideoSeconds: 61
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
});
