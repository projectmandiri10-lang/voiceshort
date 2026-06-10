import type {
  AppSettings,
  ExcitedVoicePreset,
  GenderVoiceSettings,
  JobVoiceGender,
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

export const DEFAULT_SETTINGS: AppSettings = {
  scriptModel: "gemini-2.5-flash-lite",
  ttsModel: "google/gemini-3.1-flash-tts-preview",
  language: "id-ID",
  maxVideoSeconds: ABSOLUTE_MAX_VIDEO_SECONDS,
  safetyMode: "safe_marketing",
  concurrency: 1,
  genderVoices: [
    {
      gender: "male",
      voiceName: "Charon",
      speechRate: 1
    },
    {
      gender: "female",
      voiceName: "Leda",
      speechRate: 1
    }
  ]
};

const LEGACY_GEMINI_TTS_ALIASES = new Map<string, string>([
  ["gemini-2.5-flash-preview-tts", DEFAULT_SETTINGS.ttsModel],
  ["gemini-2.5-pro-preview-tts", DEFAULT_SETTINGS.ttsModel]
]);

export function normalizeTtsModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return DEFAULT_SETTINGS.ttsModel;
  }
  return LEGACY_GEMINI_TTS_ALIASES.get(trimmed) || trimmed;
}

export const GEMINI_TTS_VOICES: TtsVoiceOption[] = [
  { voiceName: "Zephyr", label: "Zephyr", tone: "Bright", gender: "neutral" },
  { voiceName: "Puck", label: "Puck", tone: "Upbeat", gender: "male" },
  { voiceName: "Charon", label: "Charon", tone: "Informative", gender: "male" },
  { voiceName: "Kore", label: "Kore", tone: "Firm", gender: "female" },
  { voiceName: "Fenrir", label: "Fenrir", tone: "Excitable", gender: "male" },
  { voiceName: "Leda", label: "Leda", tone: "Youthful", gender: "female" },
  { voiceName: "Orus", label: "Orus", tone: "Firm", gender: "male" },
  { voiceName: "Aoede", label: "Aoede", tone: "Breezy", gender: "female" },
  { voiceName: "Callirrhoe", label: "Callirrhoe", tone: "Easy-going", gender: "female" },
  { voiceName: "Autonoe", label: "Autonoe", tone: "Bright", gender: "female" },
  { voiceName: "Enceladus", label: "Enceladus", tone: "Breathy", gender: "neutral" },
  { voiceName: "Iapetus", label: "Iapetus", tone: "Clear", gender: "male" },
  { voiceName: "Umbriel", label: "Umbriel", tone: "Easy-going", gender: "neutral" },
  { voiceName: "Algieba", label: "Algieba", tone: "Smooth", gender: "neutral" },
  { voiceName: "Despina", label: "Despina", tone: "Smooth", gender: "female" },
  { voiceName: "Erinome", label: "Erinome", tone: "Clear", gender: "female" },
  { voiceName: "Algenib", label: "Algenib", tone: "Gravelly", gender: "male" },
  { voiceName: "Rasalgethi", label: "Rasalgethi", tone: "Informative", gender: "male" },
  { voiceName: "Laomedeia", label: "Laomedeia", tone: "Upbeat", gender: "female" },
  { voiceName: "Achernar", label: "Achernar", tone: "Soft", gender: "female" },
  { voiceName: "Alnilam", label: "Alnilam", tone: "Firm", gender: "male" },
  { voiceName: "Schedar", label: "Schedar", tone: "Even", gender: "male" },
  { voiceName: "Gacrux", label: "Gacrux", tone: "Mature", gender: "male" },
  { voiceName: "Pulcherrima", label: "Pulcherrima", tone: "Forward", gender: "female" },
  { voiceName: "Achird", label: "Achird", tone: "Friendly", gender: "neutral" },
  { voiceName: "Zubenelgenubi", label: "Zubenelgenubi", tone: "Casual", gender: "neutral" },
  { voiceName: "Vindemiatrix", label: "Vindemiatrix", tone: "Gentle", gender: "female" },
  { voiceName: "Sadachbia", label: "Sadachbia", tone: "Lively", gender: "female" },
  { voiceName: "Sadaltager", label: "Sadaltager", tone: "Knowledgeable", gender: "male" },
  { voiceName: "Sulafat", label: "Sulafat", tone: "Warm", gender: "female" }
];

export const GEMINI_EXCITED_PRESETS: ExcitedVoicePreset[] = [
  {
    presetId: "female_excited_v1",
    label: "Excited Wanita V1",
    version: "v1",
    gender: "female",
    voiceName: "Leda"
  },
  {
    presetId: "female_excited_v2",
    label: "Excited Wanita V2",
    version: "v2",
    gender: "female",
    voiceName: "Autonoe"
  },
  {
    presetId: "female_excited_v3",
    label: "Excited Wanita V3",
    version: "v3",
    gender: "female",
    voiceName: "Sadachbia"
  },
  {
    presetId: "male_excited_v1",
    label: "Excited Pria V1",
    version: "v1",
    gender: "male",
    voiceName: "Fenrir"
  },
  {
    presetId: "male_excited_v2",
    label: "Excited Pria V2",
    version: "v2",
    gender: "male",
    voiceName: "Puck"
  },
  {
    presetId: "male_excited_v3",
    label: "Excited Pria V3",
    version: "v3",
    gender: "male",
    voiceName: "Orus"
  }
];

export function findTtsVoiceByName(voiceName: string): TtsVoiceOption | undefined {
  return GEMINI_TTS_VOICES.find((voice) => voice.voiceName === voiceName);
}

export function isKnownTtsVoiceName(voiceName: string): boolean {
  return Boolean(findTtsVoiceByName(voiceName));
}

export function findGenderVoiceSetting(
  settings: AppSettings,
  gender: JobVoiceGender
): GenderVoiceSettings | undefined {
  return settings.genderVoices.find((voice) => voice.gender === gender);
}
