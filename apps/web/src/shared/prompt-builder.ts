import { getContentLabel, getPlatformLabel, getToneLabel } from "../job-form-options";
import type { AiStudioPackage, AppSettings, ContentLanguage, ContentType, SocialPlatform, VisualBrief } from "../types";
import { calculateScriptWordBudget, calculateSpeechTarget, countSpokenWords } from "./speech-timing";

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
  const exactCtaText = resolveExactCtaText(input);
  if (!exactCtaText) {
    return "Do not add a CTA because this category has no custom CTA.";
  }
  return `Use this exact CTA as the final spoken sentence without paraphrasing: ${JSON.stringify(exactCtaText)}.`;
}

export function resolveExactCtaText(input: Pick<PromptInput, "contentType" | "socialPlatform" | "ctaText">): string | null {
  const customCta = input.ctaText?.trim();
  if (customCta) {
    return customCta;
  }
  if (input.contentType !== "affiliate" && input.contentType !== "video-marketing") {
    return null;
  }

  if (input.socialPlatform === "shopee" || input.socialPlatform === "tiktok") {
    return "Cek keranjang kuning sekarang";
  }
  if (["facebook", "instagram", "youtube"].includes(input.socialPlatform)) {
    return "Cek di keranjang sekarang";
  }
  return "Cek produknya sekarang";
}

export function getCaptionCharacterLimit(socialPlatform: SocialPlatform): number {
  return socialPlatform === "shopee" ? 150 : 1000;
}

export function normalizeCaptionTextForPlatform(captionText: string, socialPlatform: SocialPlatform): string {
  const normalized = String(captionText || "").replace(/\s+/g, " ").trim();
  const limit = getCaptionCharacterLimit(socialPlatform);
  const chars = Array.from(normalized);
  if (chars.length <= limit) {
    return normalized;
  }

  const truncated = chars.slice(0, limit).join("").trim();
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace >= Math.floor(limit * 0.7)
    ? truncated.slice(0, lastSpace).trim()
    : truncated;
}

function trimToWordLimit(text: string, maxWords: number): string {
  if (maxWords <= 0) {
    return "";
  }
  const tokens = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (tokens.length <= maxWords) {
    return tokens.join(" ");
  }
  return tokens.slice(0, maxWords).join(" ").trim().replace(/[,:;.!?-]+$/u, "").trim();
}

export function normalizeScriptTextForTiming(
  scriptText: string,
  input: Pick<PromptInput, "contentType" | "socialPlatform" | "ctaText" | "videoDurationSec">
): string {
  const normalized = String(scriptText || "").replace(/\s+/g, " ").trim();
  const { maxWords } = calculateScriptWordBudget(input.videoDurationSec);
  const exactCtaText = resolveExactCtaText(input);

  if (!exactCtaText) {
    return trimToWordLimit(normalized, maxWords);
  }

  const ctaWordCount = Math.max(1, countSpokenWords(exactCtaText));
  const bodyWordLimit = Math.max(1, maxWords - ctaWordCount);
  const escapedCta = exactCtaText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodyWithoutCta = normalized
    .replace(new RegExp(escapedCta, "igu"), " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,:;.!?-]+$/u, "")
    .trim();
  const trimmedBody = trimToWordLimit(bodyWithoutCta, bodyWordLimit);

  return trimmedBody ? `${trimmedBody}. ${exactCtaText}` : exactCtaText;
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
  const { minWords, maxWords, prefersUpperHalf } = calculateScriptWordBudget(input.videoDurationSec);
  const timing = calculateSpeechTarget(input.videoDurationSec);
  const languageName = input.contentLanguage === "en-US" ? "natural English" : "Bahasa Indonesia natural";
  const captionCharacterLimit = getCaptionCharacterLimit(input.socialPlatform);
  const exactCtaText = resolveExactCtaText(input);
  const ctaWordCount = exactCtaText ? countSpokenWords(exactCtaText) : 0;
  const nonCtaMaxWords = exactCtaText ? Math.max(1, maxWords - ctaWordCount) : maxWords;
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
    "- sceneText must tell the speech model to use a slightly held natural pace, brief clause pauses, and no rushed delivery, while avoiding intro, outro, audio tags, or long opening/closing silence.",
    `- sampleContextText must state the exact ${input.videoDurationSec.toFixed(2)} second duration, the ${timing.speechTargetSec.toFixed(2)} second final-word deadline, the ${minWords}-${maxWords} word budget, verified visual order, audience, narrative intent, safety limits, and a strict no-paraphrase rule.`,
    "- sampleContextText must warn the speech model not to finish too early and to fill the full duration naturally with brief pauses between clauses.",
    `- scriptText must contain ${minWords}-${maxWords} spoken words, including its CTA, and be designed for the final word to land at ${timing.speechTargetSec.toFixed(2)} seconds.`,
    "- scriptText must contain spoken words only: no labels, markdown, brackets, stage directions, timestamps, or audio tags.",
    "- scriptText must fill the duration naturally, with smooth clause-to-clause flow rather than abrupt short phrasing.",
    ...(exactCtaText
      ? [
          `- scriptText must end with this exact CTA as the final spoken sentence: ${JSON.stringify(exactCtaText)}.`,
          `- Reserve enough room for the CTA: all narration before the CTA must stay within ${nonCtaMaxWords} spoken words.`,
          "- No words may appear after the CTA, and the CTA must not be shortened, merged, or cut off."
        ]
      : []),
    ...(prefersUpperHalf
      ? ["- For this short video, scriptText should aim for the upper half of the word budget so the narration does not end too early."]
      : []),
    "- Preserve visual order and use only facts supported by the visual brief.",
    `- ${buildCtaInstruction(input)}`,
    `- captionText must be concise, must not include hashtags, and must stay within ${captionCharacterLimit} characters for this platform.`,
    "- hashtags must contain 3-8 safe, relevant tags.",
    ...contextLines(input),
    "Verified visual brief:",
    JSON.stringify(input.visualBrief)
  ].join("\n");
}

export function buildAiStudioPolishPrompt(
  input: PromptInput & { visualBrief: VisualBrief; aiPackage: AiStudioPackage }
): string {
  const { minWords, maxWords } = calculateScriptWordBudget(input.videoDurationSec);
  const timing = calculateSpeechTarget(input.videoDurationSec);
  const languageName = input.contentLanguage === "en-US" ? "natural English" : "Bahasa Indonesia natural";
  const captionCharacterLimit = getCaptionCharacterLimit(input.socialPlatform);
  const exactCtaText = resolveExactCtaText(input);
  const ctaWordCount = exactCtaText ? countSpokenWords(exactCtaText) : 0;
  const nonCtaMaxWords = exactCtaText ? Math.max(1, maxWords - ctaWordCount) : maxWords;

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
    "- This package was selected because it may end too early for the available duration.",
    "- Add only a small amount of natural connective wording or rhythmic phrasing when needed so the narration fills time more naturally.",
    "- Prefer short transitions and gentle clause expansion over new claims, new facts, or heavy rewriting.",
    "Hard rules:",
    "- Do not add, remove, rename, or reorder fields.",
    "- Do not invent facts, visuals, claims, identities, benefits, locations, or outcomes.",
    "- Preserve the verified visual order and all factual constraints from the visual brief.",
    `- sceneText must still request a single-speaker ${languageName} spoken delivery and preserve this voice-direction rule exactly: ${buildVoiceDeliveryInstruction(input)}`,
    `- sceneText must still command the final spoken word to finish at ${timing.speechTargetSec.toFixed(2)} seconds, followed by ${timing.safetyMarginSec.toFixed(2)} seconds of silence, so the audio totals exactly ${input.videoDurationSec.toFixed(2)} seconds.`,
    `- sampleContextText must still state the exact ${input.videoDurationSec.toFixed(2)} second duration, the ${timing.speechTargetSec.toFixed(2)} second final-word deadline, the ${minWords}-${maxWords} word budget, and the strict no-paraphrase rule for speech generation.`,
    "- sampleContextText must still warn the speech model not to finish too early or rush the delivery.",
    `- scriptText must stay within ${minWords}-${maxWords} spoken words, fill the duration more naturally, and keep the final CTA sentence requirement intact.`,
    ...(exactCtaText
      ? [
          `- scriptText must still end with this exact CTA as the final spoken sentence: ${JSON.stringify(exactCtaText)}.`,
          `- All narration before the CTA must stay within ${nonCtaMaxWords} spoken words so the CTA is not cut off.`,
          "- If the package is too long, shorten the earlier narration first and keep the CTA intact at the end."
        ]
      : []),
    `- ${buildCtaInstruction(input)}`,
    `- captionText must remain concise, must not include hashtags, and must stay within ${captionCharacterLimit} characters for this platform.`,
    "- hashtags must contain 3-8 safe, relevant tags.",
    "- If the current package already satisfies the rules, keep it very close and only make small quality improvements.",
    ...contextLines(input),
    "Verified visual brief:",
    JSON.stringify(input.visualBrief),
    "Current package to polish:",
    JSON.stringify(input.aiPackage)
  ].join("\n");
}
