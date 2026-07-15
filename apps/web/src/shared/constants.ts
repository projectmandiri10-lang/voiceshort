import type { AiProvider, AppSettings, ScriptAiProvider } from "../types";

export const ABSOLUTE_MAX_VIDEO_SECONDS = 60;
export const FRAME_EXTRACTION_MAX_WIDTH = 448;
export const FRAME_EXTRACTION_MAX_FRAMES = 18;
export const FRAME_EXTRACTION_MIN_FRAMES = 6;
export const FINAL_VIDEO_CRF = 26;
export const FINAL_VIDEO_MAX_DIMENSION = 1280;
export const FINAL_AUDIO_BITRATE = "64k";
export const FINAL_AUDIO_SAMPLE_RATE = 24000;
export const FINAL_VOICE_LOUDNORM = "loudnorm=I=-14:TP=-1.0:LRA=11";

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  aivene: "Aivene",
  openrouter: "OpenRouter"
};

export const DEFAULT_AIVENE_BASE_URL = "https://api.aivene.com/v1";
export const DEFAULT_AIVENE_SCRIPT_MODEL = "qwen3.7-plus";
export const DEFAULT_OPENROUTER_SCRIPT_MODEL = "google/gemini-2.5-flash-lite";

export const DEFAULT_SETTINGS: AppSettings = {
  scriptProvider: "aivene",
  scriptFallbackProvider: "openrouter",
  scriptModel: DEFAULT_AIVENE_SCRIPT_MODEL,
  taxRatePercent: 0,
  language: "id-ID",
  maxVideoSeconds: ABSOLUTE_MAX_VIDEO_SECONDS,
  safetyMode: "safe_marketing",
  concurrency: 1
};

export function normalizeScriptProvider(
  provider: string | undefined,
  fallback: ScriptAiProvider
): ScriptAiProvider {
  return provider === "aivene" || provider === "openrouter" ? provider : fallback;
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

function ensureOpenRouterGeminiPrefix(model: string): string {
  const normalized = stripGatewayGeminiPrefix(stripGoogleGeminiPrefix(collapseRepeatedPrefix(model)));
  if (normalized.includes("/")) {
    return normalized;
  }
  return normalized.startsWith("gemini-") ? `google/${normalized}` : normalized;
}

export function normalizeScriptModel(model: string, provider = DEFAULT_SETTINGS.scriptProvider): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return provider === "openrouter" ? DEFAULT_OPENROUTER_SCRIPT_MODEL : DEFAULT_AIVENE_SCRIPT_MODEL;
  }
  return provider === "openrouter"
    ? ensureOpenRouterGeminiPrefix(trimmed)
    : stripGatewayGeminiPrefix(stripGoogleGeminiPrefix(trimmed));
}
