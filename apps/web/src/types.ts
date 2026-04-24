export const CONTENT_TYPES = [
  "affiliate",
  "komedi",
  "informasi",
  "hiburan",
  "gaul",
  "cerita",
  "review-produk",
  "edukasi",
  "motivasi",
  "promosi-event"
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const VOICE_GENDERS = ["male", "female"] as const;
export type JobVoiceGender = (typeof VOICE_GENDERS)[number];
export type VoiceGender = JobVoiceGender | "neutral";

export type JobStatus = "queued" | "running" | "success" | "failed" | "interrupted";

export interface GenderVoiceSettings {
  gender: JobVoiceGender;
  voiceName: string;
  speechRate: number;
}

export interface AppSettings {
  scriptModel: string;
  ttsModel: string;
  language: "id-ID";
  maxVideoSeconds: number;
  safetyMode: "safe_marketing";
  concurrency: 1;
  genderVoices: GenderVoiceSettings[];
}

export interface JobOutput {
  captionPath?: string;
  scriptPath?: string;
  voicePath?: string;
  finalVideoPath?: string;
  artifactPaths: string[];
  updatedAt: string;
}

export interface JobRecord {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText?: string;
  referenceLink?: string;
  videoPath: string;
  videoMimeType: string;
  videoDurationSec: number;
  status: JobStatus;
  errorMessage?: string;
  output: JobOutput;
}

export interface TtsVoiceOption {
  voiceName: string;
  label: string;
  tone: string;
  gender: VoiceGender;
}

export interface ExcitedVoicePreset {
  presetId: string;
  label: string;
  version: string;
  gender: JobVoiceGender;
  voiceName: string;
}
