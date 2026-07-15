import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./constants";
import { buildAiStudioPackagePrompt, buildCtaInstruction, buildVisualBriefPrompt, type PromptInput } from "./prompt-builder";
import type { VisualBrief } from "../types";

const visualBrief: VisualBrief = {
  summary: "Produk diperlihatkan dan digunakan.",
  hook: { startSec: 0, endSec: 3, reason: "Produk langsung terlihat." },
  timeline: [{
    startSec: 0, endSec: 36, primaryVisual: "Produk", action: "Digunakan",
    onScreenText: [], narrationFocus: "Kegunaan yang terlihat", avoidClaims: []
  }],
  mustMention: [], mustAvoid: [], uncertainties: []
};

const baseInput: PromptInput = {
  settings: DEFAULT_SETTINGS,
  title: "Produk",
  description: "Jelaskan produk secara aman.",
  contentType: "affiliate",
  socialPlatform: "instagram",
  contentLanguage: "id-ID",
  tone: "natural",
  videoDurationSec: 36
};

describe("AI Studio package prompt", () => {
  it("keeps chronological evidence-only frame analysis", () => {
    const prompt = buildVisualBriefPrompt(baseInput);
    expect(prompt).toContain("Analyze the supplied video frames in chronological order.");
    expect(prompt).toContain("Use only visible evidence.");
    expect(prompt).toContain("Build a timeline spanning the full duration.");
  });

  it("targets 72 words and finishes speech at 35.8 seconds", () => {
    const prompt = buildAiStudioPackagePrompt({ ...baseInput, visualBrief });
    expect(prompt).toContain("70-74 spoken words");
    expect(prompt).toContain("finish at 35.80 seconds");
    expect(prompt).toContain("0.20 seconds of silence");
    expect(prompt).toContain("totals exactly 36.00 seconds");
    expect(prompt).toContain("without adding, repeating, paraphrasing, or omitting anything");
  });

  it("preserves a custom CTA verbatim", () => {
    expect(buildCtaInstruction({
      contentType: "affiliate", socialPlatform: "tiktok",
      ctaText: "Cek produknya sekarang."
    })).toContain('"Cek produknya sekarang."');
  });

  it("uses the requested exact platform CTA only for affiliate and marketing", () => {
    expect(buildCtaInstruction({
      contentType: "video-marketing", socialPlatform: "youtube"
    })).toContain('"Cek di keranjang sekarang"');
    expect(buildCtaInstruction({
      contentType: "affiliate", socialPlatform: "facebook"
    })).toContain('"Cek di keranjang sekarang"');
    expect(buildCtaInstruction({
      contentType: "affiliate", socialPlatform: "shopee"
    })).toContain('"Cek keranjang kuning sekarang"');
    expect(buildCtaInstruction({
      contentType: "video-marketing", socialPlatform: "tiktok"
    })).toContain('"Cek keranjang kuning sekarang"');
    expect(buildCtaInstruction({
      contentType: "affiliate", socialPlatform: "instagram"
    })).toContain('"Cek di keranjang sekarang"');
    expect(buildCtaInstruction({
      contentType: "edukasi", socialPlatform: "youtube"
    })).toContain("Do not add a CTA");
  });

  it("keeps affiliate narration aligned with the selected tone instead of defaulting to hard sell", () => {
    const informativePrompt = buildAiStudioPackagePrompt({
      ...baseInput,
      contentType: "affiliate",
      tone: "informatif",
      visualBrief
    });

    expect(informativePrompt).toContain("selected voice tone (Informatif) is authoritative");
    expect(informativePrompt).toContain("calm, clear, and explanatory");
    expect(informativePrompt).toContain("must not default to a forceful sales-announcer voice");
    expect(informativePrompt).toContain("excessive enthusiasm, shouting, or hard-sell delivery");
  });

  it("allows energetic affiliate delivery while keeping it controlled", () => {
    const energeticPrompt = buildAiStudioPackagePrompt({
      ...baseInput,
      contentType: "affiliate",
      tone: "enerjik",
      visualBrief
    });

    expect(energeticPrompt).toContain("lively and upbeat, but controlled rather than shouted");
  });
});
