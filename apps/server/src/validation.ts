import { z } from "zod";
import { CONTENT_TYPES } from "./content-config.js";
import { GENDER_ORDER, isKnownTtsVoiceName } from "./constants.js";
import type { AppSettings, ContentType, JobVoiceGender } from "./types.js";

const contentTypeSchema = z.enum(CONTENT_TYPES);
const voiceGenderSchema = z.enum(GENDER_ORDER);
const nonEmptyTextSchema = z.string().trim().min(1);
const speechRateSchema = z.number().min(0.7).max(1.3);
const optionalTextSchema = z.union([z.string(), z.undefined(), z.null()]).transform((value) => {
  const normalized = String(value ?? "").trim();
  return normalized.length ? normalized : undefined;
});

const genderVoiceSchema = z.object({
  gender: voiceGenderSchema,
  voiceName: z
    .string()
    .trim()
    .min(1)
    .refine((value) => isKnownTtsVoiceName(value), "Voice tidak tersedia pada katalog Gemini."),
  speechRate: speechRateSchema
});

export const settingsSchema = z.object({
  scriptModel: z.string().trim().min(1),
  ttsModel: z.string().trim().min(1),
  language: z.literal("id-ID"),
  maxVideoSeconds: z.number().int().min(10).max(60),
  safetyMode: z.literal("safe_marketing"),
  concurrency: z.literal(1),
  genderVoices: z
    .array(genderVoiceSchema)
    .length(GENDER_ORDER.length)
    .refine((voices) => {
      const genders = voices.map((voice) => voice.gender);
      return GENDER_ORDER.every((gender) => genders.includes(gender));
    }, "Voice default pria dan wanita wajib tersedia.")
});

const jobInputSchema = z.object({
  title: nonEmptyTextSchema,
  description: nonEmptyTextSchema,
  contentType: contentTypeSchema,
  voiceGender: voiceGenderSchema,
  tone: nonEmptyTextSchema.max(80),
  ctaText: optionalTextSchema,
  referenceLink: optionalTextSchema
});

const ttsPreviewSchema = z.object({
  voiceName: z
    .string()
    .trim()
    .min(1)
    .refine((value) => isKnownTtsVoiceName(value), "Voice tidak tersedia pada katalog Gemini."),
  speechRate: speechRateSchema.optional(),
  text: z.string().trim().min(1).max(220).optional()
});

export function parseSettings(input: unknown): AppSettings {
  const result = settingsSchema.parse(input);
  const sorted = [...result.genderVoices].sort(
    (a, b) => GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender)
  );
  return {
    ...result,
    genderVoices: sorted
  };
}

export function parseJobCreateInput(input: unknown): {
  title: string;
  description: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText?: string;
  referenceLink?: string;
} {
  return jobInputSchema.parse(input);
}

export function parseJobUpdateInput(input: unknown): {
  title: string;
  description: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText?: string;
  referenceLink?: string;
} {
  return jobInputSchema.parse(input);
}

export function parseSpeechRate(input: unknown): number {
  const numeric = typeof input === "number" ? input : Number(input);
  return speechRateSchema.parse(numeric);
}

export function parseTtsPreviewInput(input: unknown): {
  voiceName: string;
  speechRate: number;
  text?: string;
} {
  const parsed = ttsPreviewSchema.parse(input);
  return {
    voiceName: parsed.voiceName,
    speechRate: parsed.speechRate ?? 1,
    text: parsed.text
  };
}
