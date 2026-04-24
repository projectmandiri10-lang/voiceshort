import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/constants.js";
import {
  buildCaptionPrompt,
  buildScriptPrompt,
  buildVisualBriefPrompt
} from "../src/services/prompt-builder.js";
import type { VisualBrief } from "../src/types.js";

const visualBrief: VisualBrief = {
  summary: "Video memperlihatkan meja kerja berantakan lalu dirapikan memakai organizer.",
  hook: {
    startSec: 0,
    endSec: 3,
    reason: "Perbedaan kontras antara meja berantakan dan rapi terlihat jelas di awal."
  },
  timeline: [
    {
      startSec: 0,
      endSec: 3,
      primaryVisual: "Meja kerja penuh barang kecil yang berserakan.",
      action: "Kamera menyorot kondisi berantakan dari dekat.",
      onScreenText: ["meja makin rapi"],
      narrationFocus: "Hook masalah visual yang langsung terasa.",
      avoidClaims: ["Jangan klaim hasil permanen."]
    },
    {
      startSec: 3,
      endSec: 8,
      primaryVisual: "Organizer diletakkan dan barang mulai dipisah.",
      action: "Tangan menata kabel dan alat tulis ke kompartemen.",
      onScreenText: [],
      narrationFocus: "Tunjukkan perubahan yang terlihat selangkah demi selangkah.",
      avoidClaims: ["Jangan sebut merek jika tidak terlihat."]
    }
  ],
  mustMention: ["perubahan dari berantakan ke lebih rapi"],
  mustAvoid: ["klaim manfaat yang tidak terlihat"],
  uncertainties: ["bahan organizer tidak terlihat jelas"]
};

describe("prompt builder", () => {
  it("builds visual brief prompt with strict structured-output instructions", () => {
    const prompt = buildVisualBriefPrompt({
      settings: DEFAULT_SETTINGS,
      title: "Produk Organizer",
      description: "Video meja kerja sebelum dan sesudah ditata.",
      contentType: "affiliate",
      voiceGender: "female",
      tone: "enerjik",
      videoDurationSec: 18,
      ctaText: "cek detailnya sekarang"
    });

    expect(prompt).toContain("visual brief terstruktur");
    expect(prompt).toContain("Pecah video menjadi 3-8 beat");
    expect(prompt).toContain("\"timeline\"");
    expect(prompt).toContain("Jangan menebak merek");
  });

  it("builds script prompt with visual brief grounding rules", () => {
    const prompt = buildScriptPrompt({
      settings: DEFAULT_SETTINGS,
      title: "Produk Organizer",
      description: "Video meja kerja sebelum dan sesudah ditata.",
      contentType: "affiliate",
      voiceGender: "female",
      tone: "enerjik",
      videoDurationSec: 30,
      ctaText: "cek detailnya sekarang",
      visualBrief
    });

    expect(prompt).toContain("Sumber visual resmi");
    expect(prompt).toContain("\"uncertainties\"");
    expect(prompt).toContain("timeline");
    expect(prompt).toContain("cek detailnya sekarang");
  });

  it("builds caption prompt that stays aligned with script and visuals", () => {
    const prompt = buildCaptionPrompt({
      settings: DEFAULT_SETTINGS,
      title: "Fakta Menarik",
      description: "Bahas fakta singkat yang mudah dipahami.",
      contentType: "informasi",
      voiceGender: "male",
      tone: "informatif",
      videoDurationSec: 45,
      scriptText: "Ini script singkat yang mengikuti visual video.",
      visualBrief
    });

    expect(prompt).toContain("hook dan visual utama yang sama");
    expect(prompt).toContain("Referensi naskah voice over");
    expect(prompt).toContain("Sumber visual resmi");
    expect(prompt).toContain("Jangan membuat angle caption yang bertentangan");
  });
});
