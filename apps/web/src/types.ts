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
export type JobProgressPhase =
  | "queued"
  | "analyzing"
  | "scripting"
  | "captioning"
  | "synthesizing"
  | "rendering"
  | "success"
  | "failed"
  | "interrupted";
export type UserRole = "user" | "superadmin";
export type SubscriptionStatus = "active" | "inactive";
export type AssignedPackageCode = "10_video" | "50_video" | "100_video" | "custom";

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

export interface GenerationCapacity {
  overloaded: boolean;
  runningCount: number;
  queuedCount: number;
  maxRunningJobs: number;
  maxQueuedJobs: number;
  maxRunningPerUser: number;
  message: string;
}

export interface JobOutput {
  captionPath?: string;
  scriptPath?: string;
  voicePath?: string;
  finalVideoPath?: string;
  artifactPaths: string[];
  updatedAt: string;
}

export interface JobProgress {
  phase: JobProgressPhase;
  percent: number;
  label: string;
  updatedAt: string;
}

export interface JobRecord {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  ownerEmail?: string;
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
  progress: JobProgress;
  errorMessage?: string;
  output: JobOutput;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  videoQuotaTotal: number;
  videoQuotaUsed: number;
  videoQuotaRemaining: number | null;
  walletBalanceIdr: number;
  generatePriceIdr: number;
  generateCreditsRemaining: number | null;
  isUnlimited: boolean;
  disabledAt?: string | null;
  disabledReason?: string | null;
  assignedPackageCode?: AssignedPackageCode | null;
}

export interface AdminUserRecord extends AuthUser {
  createdAt: string;
  updatedAt: string;
  googleLinked: boolean;
  hasPassword: boolean;
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
