import { getContentLabel, getPlatformLabel, getToneLabel } from "../job-form-options";
import type { AppSettings, ContentLanguage, ContentType, SocialPlatform, VisualBrief } from "../types";
import { calculateSpeechTarget } from "./speech-timing";

const SCRIPT_WORDS_PER_SECOND = 2;

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
    `Custom CTA: ${input.ctaText?.trim() || "none"}`,
    `Reference link: ${input.referenceLink?.trim() || "none"}`,
    `Output language: ${input.contentLanguage}`
  ];
}

export function buildCtaInstruction(input: Pick<PromptInput, "contentType" | "socialPlatform" | "ctaText" | "referenceLink">): string {
  const customCta = input.ctaText?.trim();
  if (customCta) {
    return `Use this exact CTA as the final spoken sentence without paraphrasing: ${JSON.stringify(customCta)}.`;
  }
  if (input.contentType !== "affiliate" && input.contentType !== "video-marketing") {
    return "Do not add a CTA because this category has no custom CTA.";
  }

  if (!input.referenceLink?.trim()) {
    return "End with one concise CTA inviting viewers to review the product details before choosing. Do not mention a link, bio, description, post, cart, discount, or checkout feature.";
  }

  if (input.socialPlatform === "youtube") {
    return "End with one concise CTA directing viewers to the product link in the video description.";
  }
  if (input.socialPlatform === "facebook") {
    return "End with one concise CTA directing viewers to the product link in this post.";
  }
  return "End with one concise CTA directing viewers to the available product link. Do not invent a bio link, cart, discount, or checkout feature.";
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
  const targetWords = Math.max(10, Math.round(input.videoDurationSec * SCRIPT_WORDS_PER_SECOND));
  const minWords = Math.max(8, targetWords - 2);
  const maxWords = targetWords + 2;
  const timing = calculateSpeechTarget(input.videoDurationSec);
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
    `- sceneText must request a single-speaker ${languageName} voice over with the requested tone. It must command the speaker to read every script word exactly once, without adding, repeating, paraphrasing, or omitting anything.`,
    `- sceneText must command the final spoken word to finish at ${timing.speechTargetSec.toFixed(2)} seconds, followed by ${timing.safetyMarginSec.toFixed(2)} seconds of silence, so the audio totals exactly ${input.videoDurationSec.toFixed(2)} seconds.`,
    "- sceneText must tell the speech model to adjust speaking pace and natural pauses, with no intro, outro, audio tags, or long opening/closing silence.",
    `- sampleContextText must state the exact ${input.videoDurationSec.toFixed(2)} second duration, the ${timing.speechTargetSec.toFixed(2)} second final-word deadline, the ${minWords}-${maxWords} word budget, verified visual order, audience, narrative intent, safety limits, and a strict no-paraphrase rule.`,
    `- scriptText must contain ${minWords}-${maxWords} spoken words, including its CTA, and be designed for the final word to land at ${timing.speechTargetSec.toFixed(2)} seconds.`,
    "- scriptText must contain spoken words only: no labels, markdown, brackets, stage directions, timestamps, or audio tags.",
    "- Preserve visual order and use only facts supported by the visual brief.",
    `- ${buildCtaInstruction(input)}`,
    "- captionText must be concise and must not include hashtags.",
    "- hashtags must contain 3-8 safe, relevant tags.",
    ...contextLines(input),
    "Verified visual brief:",
    JSON.stringify(input.visualBrief)
  ].join("\n");
}
