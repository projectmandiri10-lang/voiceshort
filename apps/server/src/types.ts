export type ContentType =
  | "affiliate"
  | "komedi"
  | "informasi"
  | "hiburan"
  | "gaul"
  | "cerita"
  | "review-produk"
  | "edukasi"
  | "motivasi"
  | "promosi-event";

export type SubtitleStyle = "short_punchy" | "clear" | "narrative" | "sales";

export type JobVoiceGender = "female" | "male";
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

export interface UploadedGeminiVideo {
  fileUri: string;
  mimeType: string;
}

export interface VisualBriefHook {
  startSec: number;
  endSec: number;
  reason: string;
}

export interface VisualBriefTimelineItem {
  startSec: number;
  endSec: number;
  primaryVisual: string;
  action: string;
  onScreenText: string[];
  narrationFocus: string;
  avoidClaims: string[];
}

export interface VisualBrief {
  summary: string;
  hook: VisualBriefHook;
  timeline: VisualBriefTimelineItem[];
  mustMention: string[];
  mustAvoid: string[];
  uncertainties: string[];
}

export interface GenerateScriptInput {
  model: string;
  prompt: string;
  video?: UploadedGeminiVideo;
}

export interface GenerateCaptionMetadataInput {
  model: string;
  prompt: string;
  video?: UploadedGeminiVideo;
}

export interface GenerateVisualBriefInput {
  model: string;
  prompt: string;
  video: UploadedGeminiVideo;
}

export interface GenerateSpeechInput {
  model: string;
  text: string;
  voiceName: string;
  speechRate: number;
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
