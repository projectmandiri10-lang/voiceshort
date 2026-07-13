import type {
  AiProvider,
  AppSettings,
  ExcitedVoicePreset,
  GenderVoiceSettings,
  JobVoiceGender,
  ScriptAiProvider,
  TtsAiProvider,
  TtsVoiceOption
} from "../types";

export const ABSOLUTE_MAX_VIDEO_SECONDS = 60;
export const FRAME_EXTRACTION_MAX_WIDTH = 448;
export const FRAME_EXTRACTION_MAX_FRAMES = 18;
export const FRAME_EXTRACTION_MIN_FRAMES = 6;
export const FINAL_VIDEO_FPS = 30;
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
export const DEFAULT_AIVENE_SCRIPT_MODEL = "gemini-2.5-pro";
export const DEFAULT_OPENROUTER_SCRIPT_MODEL = "google/gemini-2.5-flash-lite";
export const DEFAULT_AIVENE_TTS_MODEL = "tts-1-hd";
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
  "gemini-3.1-flash-tts-preview",
  "google/gemini-3.1-flash-tts-preview",
  "gemini/gemini-2.5-flash-preview-tts",
  "gemini/gemini-2.5-pro-preview-tts"
]);

export function normalizeScriptProvider(
  model: string | undefined,
  fallback: ScriptAiProvider
): ScriptAiProvider {
  return model === "aivene" || model === "openrouter" ? model : fallback;
}

export function normalizeTtsProvider(
  model: string | undefined,
  fallback: AppSettings["ttsProvider"]
): AppSettings["ttsProvider"] {
  return model === "aivene" || model === "openrouter" ? model : fallback;
}

export function normalizeAiProvider(model: string | undefined, fallback: AiProvider): AiProvider {
  return normalizeScriptProvider(model, fallback);
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
  const normalized = stripLiteLlmGeminiPrefix(stripGoogleGeminiPrefix(collapseRepeatedGeminiPrefix(model)));
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
    return ensureOpenRouterGeminiPrefix(trimmed);
  }

  if (!trimmed || LEGACY_GEMINI_TTS_ALIASES.has(trimmed)) {
    return DEFAULT_AIVENE_TTS_MODEL;
  }
  return trimmed;
}

export const AIVENE_TTS_VOICES: TtsVoiceOption[] = [
  { provider: "aivene", voiceName: "alloy", label: "Alloy", tone: "Balanced", gender: "neutral" },
  { provider: "aivene", voiceName: "echo", label: "Echo", tone: "Calm", gender: "male" },
  { provider: "aivene", voiceName: "fable", label: "Fable", tone: "Expressive", gender: "neutral" },
  { provider: "aivene", voiceName: "onyx", label: "Onyx", tone: "Authoritative", gender: "male" },
  { provider: "aivene", voiceName: "nova", label: "Nova", tone: "Bright", gender: "female" },
  { provider: "aivene", voiceName: "shimmer", label: "Shimmer", tone: "Soft", gender: "female" }
];

export const OPENROUTER_TTS_VOICES: TtsVoiceOption[] = [
  { provider: "openrouter", voiceName: "Zephyr", label: "Zephyr", tone: "Bright", gender: "neutral" },
  { provider: "openrouter", voiceName: "Puck", label: "Puck", tone: "Upbeat", gender: "male" },
  { provider: "openrouter", voiceName: "Charon", label: "Charon", tone: "Informative", gender: "male" },
  { provider: "openrouter", voiceName: "Kore", label: "Kore", tone: "Firm", gender: "female" },
  { provider: "openrouter", voiceName: "Fenrir", label: "Fenrir", tone: "Excitable", gender: "male" },
  { provider: "openrouter", voiceName: "Leda", label: "Leda", tone: "Youthful", gender: "female" },
  { provider: "openrouter", voiceName: "Orus", label: "Orus", tone: "Firm", gender: "male" },
  { provider: "openrouter", voiceName: "Aoede", label: "Aoede", tone: "Breezy", gender: "female" },
  { provider: "openrouter", voiceName: "Callirrhoe", label: "Callirrhoe", tone: "Easy-going", gender: "female" },
  { provider: "openrouter", voiceName: "Autonoe", label: "Autonoe", tone: "Bright", gender: "female" },
  { provider: "openrouter", voiceName: "Enceladus", label: "Enceladus", tone: "Breathy", gender: "neutral" },
  { provider: "openrouter", voiceName: "Iapetus", label: "Iapetus", tone: "Clear", gender: "male" },
  { provider: "openrouter", voiceName: "Umbriel", label: "Umbriel", tone: "Easy-going", gender: "neutral" },
  { provider: "openrouter", voiceName: "Algieba", label: "Algieba", tone: "Smooth", gender: "neutral" },
  { provider: "openrouter", voiceName: "Despina", label: "Despina", tone: "Smooth", gender: "female" },
  { provider: "openrouter", voiceName: "Erinome", label: "Erinome", tone: "Clear", gender: "female" },
  { provider: "openrouter", voiceName: "Algenib", label: "Algenib", tone: "Gravelly", gender: "male" },
  { provider: "openrouter", voiceName: "Rasalgethi", label: "Rasalgethi", tone: "Informative", gender: "male" },
  { provider: "openrouter", voiceName: "Laomedeia", label: "Laomedeia", tone: "Upbeat", gender: "female" },
  { provider: "openrouter", voiceName: "Achernar", label: "Achernar", tone: "Soft", gender: "female" },
  { provider: "openrouter", voiceName: "Alnilam", label: "Alnilam", tone: "Firm", gender: "male" },
  { provider: "openrouter", voiceName: "Schedar", label: "Schedar", tone: "Even", gender: "male" },
  { provider: "openrouter", voiceName: "Gacrux", label: "Gacrux", tone: "Mature", gender: "male" },
  { provider: "openrouter", voiceName: "Pulcherrima", label: "Pulcherrima", tone: "Forward", gender: "female" },
  { provider: "openrouter", voiceName: "Achird", label: "Achird", tone: "Friendly", gender: "neutral" },
  { provider: "openrouter", voiceName: "Zubenelgenubi", label: "Zubenelgenubi", tone: "Casual", gender: "neutral" },
  { provider: "openrouter", voiceName: "Vindemiatrix", label: "Vindemiatrix", tone: "Gentle", gender: "female" },
  { provider: "openrouter", voiceName: "Sadachbia", label: "Sadachbia", tone: "Lively", gender: "female" },
  { provider: "openrouter", voiceName: "Sadaltager", label: "Sadaltager", tone: "Knowledgeable", gender: "male" },
  { provider: "openrouter", voiceName: "Sulafat", label: "Sulafat", tone: "Warm", gender: "female" }
];

export const ALL_TTS_VOICES: TtsVoiceOption[] = [...AIVENE_TTS_VOICES, ...OPENROUTER_TTS_VOICES];
export const GEMINI_EXCITED_PRESETS: ExcitedVoicePreset[] = [];

export function findDefaultVoiceForGender(provider: TtsAiProvider, gender: JobVoiceGender): TtsVoiceOption {
  const fallback = ALL_TTS_VOICES[0];
  if (!fallback) {
    throw new Error("Katalog voice kosong.");
  }
  return (
    ALL_TTS_VOICES.find(
      (voice) => voice.provider === provider && (voice.gender === gender || voice.gender === "neutral")
    ) || fallback
  );
}

export function findTtsVoiceByName(
  voiceName: string,
  provider?: TtsAiProvider
): TtsVoiceOption | undefined {
  return ALL_TTS_VOICES.find(
    (voice) => voice.voiceName === voiceName && (!provider || voice.provider === provider)
  );
}

export function isKnownTtsVoiceName(voiceName: string, provider?: TtsAiProvider): boolean {
  return Boolean(findTtsVoiceByName(voiceName, provider));
}

export function findGenderVoiceSetting(
  settings: AppSettings,
  gender: JobVoiceGender
): GenderVoiceSettings | undefined {
  return settings.genderVoices.find((voice) => voice.gender === gender);
}
