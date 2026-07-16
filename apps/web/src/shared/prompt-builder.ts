import { getContentLabel, getPlatformLabel, getToneLabel } from "../job-form-options";
import type { AiStudioPackage, AppSettings, ContentLanguage, ContentType, SocialPlatform, VisualBrief } from "../types";
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

function buildVoiceDeliveryInstruction(input: Pick<PromptInput, "contentType" | "tone" | "contentLanguage">): string {
  const selectedTone = getToneLabel(input.contentLanguage, input.tone);
  const toneGuidance: Record<string, string> = {
    natural: "relaxed, conversational, and unforced",
    enerjik: "lively and upbeat, but controlled rather than shouted",
    friendly: "casual, approachable, and easygoing",
    informatif: "calm, clear, and explanatory",
    fun: "playful and expressive without becoming excessive",
    hangat: "warm, gentle, and reassuring",
    tegas: "firm and confident, but never aggressive"
  };
  const delivery = toneGuidance[input.tone] || "faithful to the selected tone";
  const affiliateGuardrail = input.contentType === "affiliate"
    ? " Affiliate content must not default to a forceful sales-announcer voice, excessive enthusiasm, shouting, or hard-sell delivery."
    : "";

  return `The selected voice tone (${selectedTone}) is authoritative: deliver it ${delivery}.${affiliateGuardrail}`;
}

export function buildCtaInstruction(input: Pick<PromptInput, "contentType" | "socialPlatform" | "ctaText">): string {
  const customCta = input.ctaText?.trim();
  if (customCta) {
    return `Use this exact CTA as the final spoken sentence without paraphrasing: ${JSON.stringify(customCta)}.`;
  }
  if (input.contentType !== "affiliate" && input.contentType !== "video-marketing") {
    return "Do not add a CTA because this category has no custom CTA.";
  }

  if (input.socialPlatform === "shopee" || input.socialPlatform === "tiktok") {
    return 'Use this exact CTA as the final spoken sentence without paraphrasing: "Cek keranjang kuning sekarang".';
  }
  if (["facebook", "instagram", "youtube"].includes(input.socialPlatform)) {
    return 'Use this exact CTA as the final spoken sentence without paraphrasing: "Cek di keranjang sekarang".';
  }
  return 'Use this exact CTA as the final spoken sentence without paraphrasing: "Cek produknya sekarang".';
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
    `- sceneText must request a single-speaker ${languageName} spoken delivery with the requested tone. It must command the speaker to read every script word exactly once, without adding, repeating, paraphrasing, or omitting anything.`,
    `- sceneText and sampleContextText must preserve this voice-direction rule exactly: ${buildVoiceDeliveryInstruction(input)}`,
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

export function buildAiStudioPolishPrompt(
  input: PromptInput & { visualBrief: VisualBrief; aiPackage: AiStudioPackage }
): string {
  const targetWords = Math.max(10, Math.round(input.videoDurationSec * SCRIPT_WORDS_PER_SECOND));
  const minWords = Math.max(8, targetWords - 2);
  const maxWords = targetWords + 2;
  const timing = calculateSpeechTarget(input.videoDurationSec);
  const languageName = input.contentLanguage === "en-US" ? "natural English" : "Bahasa Indonesia natural";

  return [
    "Polish the supplied Google AI Studio Generate Speech package and social posting copy.",
    "Return valid JSON only with the exact same schema. Do not use markdown or code fences.",
    "Required JSON schema:",
    JSON.stringify({
      sceneText: "text ready for the AI Studio Scene field",
      sampleContextText: "text ready for the AI Studio Sample Context field",
      scriptText: "clean spoken narration only",
      captionText: "social caption without hashtags",
      hashtags: ["#tag"]
    }),
    "Polish goals:",
    "- Improve clarity, wording, rhythm, and flow.",
    "- Keep the writing natural, concise, and ready to use.",
    "Hard rules:",
    "- Do not add, remove, rename, or reorder fields.",
    "- Do not invent facts, visuals, claims, identities, benefits, locations, or outcomes.",
    "- Preserve the verified visual order and all factual constraints from the visual brief.",
    `- sceneText must still request a single-speaker ${languageName} spoken delivery and preserve this voice-direction rule exactly: ${buildVoiceDeliveryInstruction(input)}`,
    `- sceneText must still command the final spoken word to finish at ${timing.speechTargetSec.toFixed(2)} seconds, followed by ${timing.safetyMarginSec.toFixed(2)} seconds of silence, so the audio totals exactly ${input.videoDurationSec.toFixed(2)} seconds.`,
    `- sampleContextText must still state the exact ${input.videoDurationSec.toFixed(2)} second duration, the ${timing.speechTargetSec.toFixed(2)} second final-word deadline, the ${minWords}-${maxWords} word budget, and the strict no-paraphrase rule for speech generation.`,
    `- scriptText must stay within ${minWords}-${maxWords} spoken words and keep the final CTA sentence requirement intact.`,
    `- ${buildCtaInstruction(input)}`,
    "- captionText must remain concise and must not include hashtags.",
    "- hashtags must contain 3-8 safe, relevant tags.",
    "- If the current package already satisfies the rules, keep it very close and only make small quality improvements.",
    ...contextLines(input),
    "Verified visual brief:",
    JSON.stringify(input.visualBrief),
    "Current package to polish:",
    JSON.stringify(input.aiPackage)
  ].join("\n");
}
