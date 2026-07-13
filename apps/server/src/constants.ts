import type {
  AiProvider,
  AppSettings,
  ExcitedVoicePreset,
  GenderVoiceSettings,
  JobVoiceGender,
  TtsVoiceOption
} from "./types.js";

export const MAX_HISTORY = 20;
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const DEFAULT_PORT = 8788;
export const GENDER_ORDER: JobVoiceGender[] = ["male", "female"];
export const ABSOLUTE_MAX_VIDEO_SECONDS = 60;

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  aivene: "Aivene",
  openrouter: "OpenRouter"
};

export const DEFAULT_AIVENE_BASE_URL = "https://api.aivene.com/v1";
export const DEFAULT_AIVENE_SCRIPT_MODEL = "gemini-2.5-pro";
export const DEFAULT_OPENROUTER_SCRIPT_MODEL = "google/gemini-2.5-flash-lite";
export const DEFAULT_AIVENE_TTS_MODEL = "tts-1-hd";
export const DEFAULT_AIVENE_GEMINI_TTS_MODEL = "gemini-2.5-pro-tts";
export const DEFAULT_OPENROUTER_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";

export const DEFAULT_SETTINGS: AppSettings = {
  scriptProvider: "aivene",
  scriptFallbackProvider: "openrouter",
  scriptModel: DEFAULT_AIVENE_SCRIPT_MODEL,
  ttsProvider: "aivene",
  ttsFallbackProvider: "openrouter",
  ttsModel: DEFAULT_AIVENE_TTS_MODEL,
  taxRatePercent: 0,
  language: "id-ID",
  maxVideoSeconds: ABSOLUTE_MAX_VIDEO_SECONDS,
  safetyMode: "safe_marketing",
  concurrency: 1,
  genderVoices: [
    {
      gender: "male",
      voiceName: "echo",
      speechRate: 1
    },
    {
      gender: "female",
      voiceName: "nova",
      speechRate: 1
    }
  ]
};

const LEGACY_GEMINI_TTS_ALIASES = new Set<string>([
  "",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
  "gemini-2.5-pro-tts",
  "gemini-3.1-flash-tts-preview",
  "google/gemini-3.1-flash-tts-preview",
  "google/gemini-2.5-pro-tts",
  "gemini/gemini-2.5-flash-preview-tts",
  "gemini/gemini-2.5-pro-preview-tts"
]);

const OPENROUTER_SUPPORTED_TTS_MODELS = new Set<string>([DEFAULT_OPENROUTER_TTS_MODEL]);

export function normalizeAiProvider(model: string | undefined, fallback: AiProvider): AiProvider {
  return model === "aivene" || model === "openrouter" ? model : fallback;
}

function stripGoogleGeminiPrefix(model: string): string {
  return model.startsWith("google/gemini-") ? model.slice("google/".length) : model;
}

function collapseRepeatedGeminiPrefix(model: string): string {
  let normalized = model.trim();
  while (normalized.startsWith("gemini/gemini/")) {
    normalized = `gemini/${normalized.slice("gemini/gemini/".length)}`;
  }
  while (normalized.startsWith("google/google/")) {
    normalized = `google/${normalized.slice("google/google/".length)}`;
  }
  return normalized;
}

function stripLiteLlmGeminiPrefix(model: string): string {
  const normalized = collapseRepeatedGeminiPrefix(model);
  return normalized.startsWith("gemini/gemini-") ? normalized.slice("gemini/".length) : normalized;
}

function normalizeAiveneGeminiModel(model: string): string {
  return stripLiteLlmGeminiPrefix(stripGoogleGeminiPrefix(model));
}

function ensureOpenRouterGeminiPrefix(model: string): string {
  const normalized = stripLiteLlmGeminiPrefix(stripGoogleGeminiPrefix(model));
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
  if (provider === "openrouter") {
    return ensureOpenRouterGeminiPrefix(trimmed);
  }
  return normalizeAiveneGeminiModel(trimmed);
}

export function normalizeTtsModel(model: string, provider = DEFAULT_SETTINGS.ttsProvider): string {
  const trimmed = model.trim();
  if (provider === "openrouter") {
    if (!trimmed || LEGACY_GEMINI_TTS_ALIASES.has(trimmed)) {
      return DEFAULT_OPENROUTER_TTS_MODEL;
    }
    const normalized = ensureOpenRouterGeminiPrefix(trimmed);
    return OPENROUTER_SUPPORTED_TTS_MODELS.has(normalized) ? normalized : DEFAULT_OPENROUTER_TTS_MODEL;
  }

  if (!trimmed) {
    return DEFAULT_AIVENE_TTS_MODEL;
  }

  const normalized = normalizeAiveneGeminiModel(trimmed);
  if (LEGACY_GEMINI_TTS_ALIASES.has(trimmed)) {
    return DEFAULT_AIVENE_GEMINI_TTS_MODEL;
  }
  return normalized.startsWith("gemini-") ? normalized : trimmed;
}

const AIVENE_OPENAI_TTS_VOICES: TtsVoiceOption[] = [
  { provider: "aivene", voiceName: "alloy", label: "Alloy", tone: "Balanced", gender: "neutral" },
  { provider: "aivene", voiceName: "echo", label: "Echo", tone: "Calm", gender: "male" },
  { provider: "aivene", voiceName: "fable", label: "Fable", tone: "Expressive", gender: "neutral" },
  { provider: "aivene", voiceName: "onyx", label: "Onyx", tone: "Authoritative", gender: "male" },
  { provider: "aivene", voiceName: "nova", label: "Nova", tone: "Bright", gender: "female" },
  { provider: "aivene", voiceName: "shimmer", label: "Shimmer", tone: "Soft", gender: "female" }
];

const GEMINI_TTS_VOICE_DEFS: Array<{
  slug: string;
  label: string;
  tone: string;
  gender: TtsVoiceOption["gender"];
}> = [
  { slug: "zephyr", label: "Zephyr", tone: "Bright", gender: "neutral" },
  { slug: "puck", label: "Puck", tone: "Upbeat", gender: "male" },
  { slug: "charon", label: "Charon", tone: "Informative", gender: "male" },
  { slug: "kore", label: "Kore", tone: "Firm", gender: "female" },
  { slug: "fenrir", label: "Fenrir", tone: "Excitable", gender: "male" },
  { slug: "leda", label: "Leda", tone: "Youthful", gender: "female" },
  { slug: "orus", label: "Orus", tone: "Firm", gender: "male" },
  { slug: "aoede", label: "Aoede", tone: "Breezy", gender: "female" },
  { slug: "callirrhoe", label: "Callirrhoe", tone: "Easy-going", gender: "female" },
  { slug: "autonoe", label: "Autonoe", tone: "Bright", gender: "female" },
  { slug: "enceladus", label: "Enceladus", tone: "Breathy", gender: "neutral" },
  { slug: "iapetus", label: "Iapetus", tone: "Clear", gender: "male" },
  { slug: "umbriel", label: "Umbriel", tone: "Easy-going", gender: "neutral" },
  { slug: "algieba", label: "Algieba", tone: "Smooth", gender: "neutral" },
  { slug: "despina", label: "Despina", tone: "Smooth", gender: "female" },
  { slug: "erinome", label: "Erinome", tone: "Clear", gender: "female" },
  { slug: "algenib", label: "Algenib", tone: "Gravelly", gender: "male" },
  { slug: "rasalgethi", label: "Rasalgethi", tone: "Informative", gender: "male" },
  { slug: "laomedeia", label: "Laomedeia", tone: "Upbeat", gender: "female" },
  { slug: "achernar", label: "Achernar", tone: "Soft", gender: "female" },
  { slug: "alnilam", label: "Alnilam", tone: "Firm", gender: "male" },
  { slug: "schedar", label: "Schedar", tone: "Even", gender: "male" },
  { slug: "gacrux", label: "Gacrux", tone: "Mature", gender: "male" },
  { slug: "pulcherrima", label: "Pulcherrima", tone: "Forward", gender: "female" },
  { slug: "achird", label: "Achird", tone: "Friendly", gender: "neutral" },
  { slug: "zubenelgenubi", label: "Zubenelgenubi", tone: "Casual", gender: "neutral" },
  { slug: "vindemiatrix", label: "Vindemiatrix", tone: "Gentle", gender: "female" },
  { slug: "sadachbia", label: "Sadachbia", tone: "Lively", gender: "female" },
  { slug: "sadaltager", label: "Sadaltager", tone: "Knowledgeable", gender: "male" },
  { slug: "sulafat", label: "Sulafat", tone: "Warm", gender: "female" }
];

export const AIVENE_GEMINI_TTS_VOICES: TtsVoiceOption[] = GEMINI_TTS_VOICE_DEFS.map((voice) => ({
  provider: "aivene",
  voiceName: voice.slug,
  label: voice.label,
  tone: voice.tone,
  gender: voice.gender
}));

export const OPENROUTER_TTS_VOICES: TtsVoiceOption[] = GEMINI_TTS_VOICE_DEFS.map((voice) => ({
  provider: "openrouter",
  voiceName: voice.label,
  label: voice.label,
  tone: voice.tone,
  gender: voice.gender
}));

export const AIVENE_TTS_VOICES: TtsVoiceOption[] = [...AIVENE_OPENAI_TTS_VOICES, ...AIVENE_GEMINI_TTS_VOICES];
export const ALL_TTS_VOICES: TtsVoiceOption[] = [...AIVENE_TTS_VOICES, ...OPENROUTER_TTS_VOICES];
export const GEMINI_EXCITED_PRESETS: ExcitedVoicePreset[] = [];

export function getTtsVoices(provider?: AiProvider, model?: string): TtsVoiceOption[] {
  if (!provider) {
    return ALL_TTS_VOICES;
  }
  if (provider === "openrouter") {
    return OPENROUTER_TTS_VOICES;
  }
  const normalizedModel = normalizeTtsModel(model || "", provider);
  return normalizedModel.startsWith("gemini-") ? AIVENE_GEMINI_TTS_VOICES : AIVENE_OPENAI_TTS_VOICES;
}

export function findDefaultVoiceForGender(provider: AiProvider, gender: JobVoiceGender, model?: string): TtsVoiceOption {
  const catalog = getTtsVoices(provider, model);
  const fallback = catalog[0] || ALL_TTS_VOICES[0];
  if (!fallback) {
    throw new Error("Katalog voice kosong.");
  }
  return (
    catalog.find((voice) => voice.gender === gender || voice.gender === "neutral") || fallback
  );
}

export function findTtsVoiceByName(voiceName: string, provider?: AiProvider, model?: string): TtsVoiceOption | undefined {
  const normalizedVoiceName = voiceName.trim().toLowerCase();
  return getTtsVoices(provider, model).find((voice) => voice.voiceName.toLowerCase() === normalizedVoiceName);
}

export function isKnownTtsVoiceName(voiceName: string, provider?: AiProvider, model?: string): boolean {
  return Boolean(findTtsVoiceByName(voiceName, provider, model));
}

export function findGenderVoiceSetting(
  settings: AppSettings,
  gender: JobVoiceGender
): GenderVoiceSettings | undefined {
  return settings.genderVoices.find((voice) => voice.gender === gender);
}
