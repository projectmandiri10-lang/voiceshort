import { describe, expect, it } from "vitest";
import {
  ensureSocialMetadata,
  extractAudioFromResponse,
  extractSocialMetadata,
  extractScriptText,
  extractVisualBrief,
  formatSocialMetadataFile
} from "../src/utils/model-output.js";

describe("model output parser", () => {
  it("extracts script from code fence json", () => {
    const response = {
      text: "```json\n{\"script\":\"Halo ini script.\"}\n```"
    };
    expect(extractScriptText(response)).toBe("Halo ini script.");
  });

  it("extracts script from candidates text", () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: "Script langsung dari candidates." }]
          }
        }
      ]
    };
    expect(extractScriptText(response)).toContain("Script langsung");
  });

  it("extracts base64 audio", () => {
    const base64 = Buffer.from("test-audio").toString("base64");
    const response = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: base64, mimeType: "audio/wav" } }]
          }
        }
      ]
    };
    const audio = extractAudioFromResponse(response);
    expect(audio.data.toString("utf8")).toBe("test-audio");
    expect(audio.mimeType).toBe("audio/wav");
  });

  it("extracts social metadata from json", () => {
    const response = {
      text: '{"caption":"Produk praktis buat harian kamu. Klik untuk lihat detail!","hashtags":["#reelsfacebook","#affiliate","#produkviral"]}'
    };
    const social = extractSocialMetadata(response);
    expect(social.caption).toContain("Produk praktis");
    expect(social.hashtags).toContain("#affiliate");
  });

  it("falls back to default metadata if hashtags empty", () => {
    const candidate = {
      caption: "Caption saja tanpa hashtag",
      hashtags: []
    };
    const social = ensureSocialMetadata(candidate, "Fallback caption", [
      "#reelsfacebook",
      "#affiliate"
    ]);
    expect(social.caption).toContain("Caption saja");
    expect(social.hashtags.length).toBeGreaterThan(0);
  });

  it("formats caption and hashtags into one text artifact", () => {
    const formatted = formatSocialMetadataFile({
      caption: "Produk praktis buat harian kamu.",
      hashtags: ["#affiliate", "#shorts", "#fyp"]
    });
    expect(formatted).toBe("Produk praktis buat harian kamu.\n\n#affiliate #shorts #fyp\n");
  });

  it("extracts visual brief from fenced json", () => {
    const response = {
      text: `\`\`\`json
{
  "summary": "Video menunjukkan meja berantakan lalu dirapikan.",
  "hook": {
    "startSec": 0,
    "endSec": 2,
    "reason": "Perubahan visual terlihat kuat."
  },
  "timeline": [
    {
      "startSec": 0,
      "endSec": 2,
      "primaryVisual": "Meja berantakan",
      "action": "Kamera menyorot barang berserakan",
      "onScreenText": ["before"],
      "narrationFocus": "Masalah yang langsung terlihat",
      "avoidClaims": ["Jangan klaim merek"]
    }
  ],
  "mustMention": ["perubahan kondisi meja"],
  "mustAvoid": ["klaim yang tidak terlihat"],
  "uncertainties": ["bahan produk tidak jelas"]
}
\`\`\``
    };

    expect(extractVisualBrief(response)).toEqual({
      summary: "Video menunjukkan meja berantakan lalu dirapikan.",
      hook: {
        startSec: 0,
        endSec: 2,
        reason: "Perubahan visual terlihat kuat."
      },
      timeline: [
        {
          startSec: 0,
          endSec: 2,
          primaryVisual: "Meja berantakan",
          action: "Kamera menyorot barang berserakan",
          onScreenText: ["before"],
          narrationFocus: "Masalah yang langsung terlihat",
          avoidClaims: ["Jangan klaim merek"]
        }
      ],
      mustMention: ["perubahan kondisi meja"],
      mustAvoid: ["klaim yang tidak terlihat"],
      uncertainties: ["bahan produk tidak jelas"]
    });
  });

  it("throws when visual brief json is invalid", () => {
    expect(() =>
      extractVisualBrief({
        text: "{\"summary\":\"Ada ringkasan tapi tanpa timeline\"}"
      })
    ).toThrow("Visual brief");
  });
});
