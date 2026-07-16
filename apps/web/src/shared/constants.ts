import type { AiProvider, AppSettings, ScriptAiProvider } from "../types";

export const ABSOLUTE_MAX_VIDEO_SECONDS = 60;
export const FRAME_EXTRACTION_MAX_WIDTH = 448;
export const FRAME_EXTRACTION_MAX_FRAMES = 18;
export const FRAME_EXTRACTION_MIN_FRAMES = 6;
export const FREE_ANALYSIS_LIMIT = 10;
export const FINAL_VIDEO_CRF = 26;
export const FINAL_VIDEO_MAX_DIMENSION = 1280;
export const FINAL_AUDIO_BITRATE = "64k";
export const FINAL_AUDIO_SAMPLE_RATE = 24000;
export const FINAL_VOICE_LOUDNORM = "loudnorm=I=-14:TP=-1.0:LRA=11";

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  aivene: "Aivene",
  zai: "Z.AI"
};

export const DEFAULT_AIVENE_BASE_URL = "https://api.aivene.com/v1";
export const DEFAULT_AIVENE_SCRIPT_MODEL = "gpt-5.4-nano";
export const FREE_USER_AIVENE_SCRIPT_MODEL = "gpt-5.4-nano";
export const AIVENE_SCRIPT_MODELS = ["gpt-5.4-nano"] as const;
export const DEFAULT_ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";
export const DEFAULT_ZAI_SCRIPT_MODEL = "glm-5v-turbo";

export const DEFAULT_SETTINGS: AppSettings = {
  scriptProvider: "aivene",
  scriptFallbackProvider: "zai",
  scriptModel: DEFAULT_AIVENE_SCRIPT_MODEL,
  taxRatePercent: 0,
  language: "id-ID",
  maxVideoSeconds: ABSOLUTE_MAX_VIDEO_SECONDS,
  safetyMode: "safe_marketing",
  concurrency: 1,
  subscriptionPriceIdr: 20_000,
  subscriptionDays: 30,
  qrisMerchantName: "MEGAKOMINDO",
  qrisImageUrl: "/qris/megakomindo-qris.jpg",
  qrisInstructions: "Scan QRIS lalu bayar sesuai nominal unik sampai dua digit terakhir.",
  qrisManualOverride: "auto",
  qrisManualOverrideUntil: null
};

export function normalizeScriptProvider(
  provider: string | undefined,
  fallback: ScriptAiProvider
): ScriptAiProvider {
  return provider === "aivene" || provider === "zai" ? provider : fallback;
}

export function normalizeAiProvider(provider: string | undefined, fallback: AiProvider): AiProvider {
  return normalizeScriptProvider(provider, fallback);
}

function stripGoogleGeminiPrefix(model: string): string {
  return model.startsWith("google/gemini-") ? model.slice("google/".length) : model;
}

function collapseRepeatedPrefix(model: string): string {
  let normalized = model.trim();
  while (normalized.startsWith("gemini/gemini/")) {
    normalized = `gemini/${normalized.slice("gemini/gemini/".length)}`;
  }
  while (normalized.startsWith("google/google/")) {
    normalized = `google/${normalized.slice("google/google/".length)}`;
  }
  return normalized;
}

function stripGatewayGeminiPrefix(model: string): string {
  const normalized = collapseRepeatedPrefix(model);
  return normalized.startsWith("gemini/gemini-") ? normalized.slice("gemini/".length) : normalized;
}

export function normalizeScriptModel(model: string, provider = DEFAULT_SETTINGS.scriptProvider): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return provider === "zai" ? DEFAULT_ZAI_SCRIPT_MODEL : DEFAULT_AIVENE_SCRIPT_MODEL;
  }
  return provider === "zai"
    ? trimmed
    : stripGatewayGeminiPrefix(stripGoogleGeminiPrefix(trimmed));
}
