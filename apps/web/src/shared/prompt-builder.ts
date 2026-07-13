import { getContentLabel, getPlatformLabel, getToneLabel } from "../job-form-options";
import type { AppSettings, ContentLanguage, ContentType, SocialPlatform, VisualBrief } from "../types";

export interface PromptInput {
  settings: AppSettings;
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
  contentLanguage: ContentLanguage;
  tone: string;
  videoDurationSec: number;
  frameCount?: number;
  ctaText?: string;
  referenceLink?: string;
}

function contextLines(input: PromptInput): string[] {
  return [
    `Title: ${input.title}`,
    `Brief: ${input.description}`,
    `Category: ${getContentLabel(input.contentLanguage, input.contentType)}`,
    `Target platform: ${getPlatformLabel(input.contentLanguage, input.socialPlatform)}`,
    `Tone: ${getToneLabel(input.contentLanguage, input.tone)}`,
    `Exact video duration: ${input.videoDurationSec.toFixed(2)} seconds`,
    `CTA: ${input.ctaText?.trim() || "none"}`,
    `Reference link: ${input.referenceLink?.trim() || "none"}`,
    `Output language: ${input.contentLanguage}`
  ];
}

export function buildVisualBriefPrompt(input: PromptInput): string {
  return [
    "Analyze the supplied video frames in chronological order.",
    "Use only visible evidence. Never invent brands, benefits, identities, locations, or outcomes.",
    `The frames cover a ${input.videoDurationSec.toFixed(2)} second video. Build a timeline spanning the full duration.`,
    "Return valid JSON only with this schema:",
    JSON.stringify({
      summary: "concise visual summary",
      hook: { startSec: 0, endSec: 3, reason: "strongest visible hook" },
      timeline: [{
        startSec: 0, endSec: 3, primaryVisual: "visible subject", action: "visible action",
        onScreenText: [], narrationFocus: "safe narration focus", avoidClaims: []
      }],
      mustMention: [], mustAvoid: [], uncertainties: []
    }),
    ...contextLines(input)
  ].join("\n");
}

export function buildAiStudioPackagePrompt(input: PromptInput & { visualBrief: VisualBrief }): string {
  const targetWords = Math.max(10, Math.round(input.videoDurationSec * 2.2));
  const languageName = input.contentLanguage === "en-US" ? "natural English" : "Bahasa Indonesia natural";
  return [
    "Create a complete Google AI Studio Generate Speech package and social posting copy from the verified visual brief.",
    "Return valid JSON only. Do not use markdown or code fences.",
    "Required JSON schema:",
    JSON.stringify({
      sceneText: "text ready for the AI Studio Scene field",
      sampleContextText: "text ready for the AI Studio Sample Context field",
      scriptText: "clean spoken narration only",
      captionText: "social caption without hashtags",
      hashtags: ["#tag"]
    }),
    "Rules:",
    `- sceneText must request a single-speaker ${languageName} voice over with the requested tone and explicitly command the speech to end naturally at exactly ${input.videoDurationSec.toFixed(2)} seconds.`,
    "- sceneText must tell the speech model to adjust pace and natural pauses, never add an intro, outro, or extra spoken words.",
    "- sampleContextText must summarize the verified visual sequence, audience, narrative intent, safety limits, and exact timing requirement.",
    `- scriptText should be about ${targetWords} words and designed to land at ${input.videoDurationSec.toFixed(2)} seconds.`,
    "- scriptText must contain spoken words only: no labels, markdown, brackets, stage directions, timestamps, or audio tags.",
    "- Preserve visual order and use only facts supported by the visual brief.",
    "- captionText must be concise and must not include hashtags.",
    "- hashtags must contain 3-8 safe, relevant tags.",
    ...contextLines(input),
    "Verified visual brief:",
    JSON.stringify(input.visualBrief)
  ].join("\n");
}
