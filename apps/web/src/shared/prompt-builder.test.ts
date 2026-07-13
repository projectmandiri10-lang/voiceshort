import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./constants";
import { buildAiStudioPackagePrompt, buildCtaInstruction, type PromptInput } from "./prompt-builder";
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
      ctaText: "Cek produknya sekarang.", referenceLink: "https://example.com"
    })).toContain('"Cek produknya sekarang."');
  });

  it("uses safe platform fallback only for affiliate and marketing", () => {
    expect(buildCtaInstruction({
      contentType: "video-marketing", socialPlatform: "youtube", referenceLink: "https://example.com"
    })).toContain("video description");
    expect(buildCtaInstruction({
      contentType: "affiliate", socialPlatform: "facebook", referenceLink: "https://example.com"
    })).toContain("this post");
    expect(buildCtaInstruction({
      contentType: "affiliate", socialPlatform: "shopee"
    })).toContain("Do not mention a link, bio, description, post, cart, discount, or checkout feature");
    expect(buildCtaInstruction({
      contentType: "edukasi", socialPlatform: "youtube", referenceLink: "https://example.com"
    })).toContain("Do not add a CTA");
  });
});
