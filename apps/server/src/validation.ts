import { z } from "zod";
import { CONTENT_TYPES } from "./content-config.js";
import { GENDER_ORDER, isKnownTtsVoiceName } from "./constants.js";
import type { AppSettings, AssignedPackageCode, ContentType, JobVoiceGender, UserRole } from "./types.js";

const contentTypeSchema = z.enum(CONTENT_TYPES);
const voiceGenderSchema = z.enum(GENDER_ORDER);
const nonEmptyTextSchema = z.string().trim().min(1);
const speechRateSchema = z.number().min(0.7).max(1.3);
const optionalTextSchema = z.union([z.string(), z.undefined(), z.null()]).transform((value) => {
  const normalized = String(value ?? "").trim();
  return normalized.length ? normalized : undefined;
});

function normalizeHashtagHints(values: string[]): string[] | undefined {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result.length ? result : undefined;
}

function parseHashtagHintsInput(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? ""));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("hashtagHints harus berupa JSON array string.");
    }
    return parsed.map((item) => String(item ?? ""));
  }

  throw new Error("hashtagHints harus berupa array string.");
}

const optionalHashtagHintsSchema = z
  .preprocess(
    (value) => parseHashtagHintsInput(value),
    z.array(z.string().trim().min(1).max(80)).max(20).optional()
  )
  .transform((value) => normalizeHashtagHints(value ?? []));
const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(100);

const genderVoiceSchema = z.object({
  gender: voiceGenderSchema,
  voiceName: z
    .string()
    .trim()
    .min(1)
    .refine((value) => isKnownTtsVoiceName(value), "Voice tidak tersedia."),
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
  hashtagHints: optionalHashtagHintsSchema,
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
    .refine((value) => isKnownTtsVoiceName(value), "Voice tidak tersedia."),
  speechRate: speechRateSchema.optional(),
  text: z.string().trim().min(1).max(220).optional()
});

const authRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional()
});

const authLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

const adminUserUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  role: z.enum(["user", "superadmin"]).optional(),
  subscriptionStatus: z.enum(["active", "inactive"]).optional(),
  isUnlimited: z.boolean().optional(),
  disabled: z.boolean().optional(),
  disabledReason: z.string().trim().max(240).optional(),
  assignedPackageCode: z.enum(["10_video", "50_video", "100_video", "custom"]).nullable().optional(),
  videoQuotaTotal: z.number().int().min(0).max(100000).optional(),
  videoQuotaUsed: z.number().int().min(0).max(100000).optional()
});

const adminUserCreateSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  role: z.enum(["user", "superadmin"]).optional(),
  subscriptionStatus: z.enum(["active", "inactive"]).optional(),
  isUnlimited: z.boolean().optional()
});

const adminPackageGrantSchema = z
  .object({
    packageCode: z.enum(["10_video", "50_video", "100_video", "custom"]),
    customAmountIdr: z.number().int().min(1000).max(100000000).optional(),
    description: z.string().trim().max(240).optional()
  })
  .refine((value) => value.packageCode !== "custom" || Boolean(value.customAmountIdr), {
    message: "Nominal custom wajib diisi.",
    path: ["customAmountIdr"]
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
  hashtagHints?: string[];
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
  hashtagHints?: string[];
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

export function parseAuthRegisterInput(input: unknown): {
  email: string;
  password: string;
  displayName?: string;
} {
  return authRegisterSchema.parse(input);
}

export function parseAuthLoginInput(input: unknown): {
  email: string;
  password: string;
} {
  return authLoginSchema.parse(input);
}

export function parseAdminUserUpdateInput(input: unknown): {
  displayName?: string;
  role?: UserRole;
  subscriptionStatus?: "active" | "inactive";
  isUnlimited?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  assignedPackageCode?: AssignedPackageCode | null;
  videoQuotaTotal?: number;
  videoQuotaUsed?: number;
} {
  return adminUserUpdateSchema.parse(input);
}

export function parseAdminUserCreateInput(input: unknown): {
  email: string;
  password: string;
  displayName?: string;
  role: UserRole;
  subscriptionStatus: "active" | "inactive";
  isUnlimited: boolean;
} {
  const parsed = adminUserCreateSchema.parse(input);
  return {
    ...parsed,
    role: parsed.role ?? "user",
    subscriptionStatus: parsed.subscriptionStatus ?? "active",
    isUnlimited: parsed.isUnlimited ?? false
  };
}

export function parseAdminPackageGrantInput(input: unknown): {
  packageCode: AssignedPackageCode;
  customAmountIdr?: number;
  description?: string;
} {
  return adminPackageGrantSchema.parse(input);
}
