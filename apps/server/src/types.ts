export type ContentType =
  | "affiliate"
  | "video-marketing"
  | "komedi"
  | "informasi"
  | "hiburan"
  | "gaul"
  | "cerita"
  | "review-produk"
  | "edukasi"
  | "motivasi"
  | "promosi-event";

export const SOCIAL_PLATFORMS = [
  "facebook",
  "tiktok",
  "youtube",
  "shopee",
  "instagram",
  "lainnya"
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SubtitleStyle = "short_punchy" | "clear" | "narrative" | "sales";

export type JobVoiceGender = "female" | "male";
export type VoiceGender = JobVoiceGender | "neutral";
export type AiProvider = "aivene" | "openrouter";
export const CONTENT_LANGUAGES = ["id-ID", "en-US"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const SCRIPT_MODES = ["auto_analysis", "manual_script"] as const;
export type ScriptMode = (typeof SCRIPT_MODES)[number];

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
  scriptProvider: AiProvider;
  scriptFallbackProvider: AiProvider;
  scriptModel: string;
  ttsProvider: AiProvider;
  ttsFallbackProvider: AiProvider;
  ttsModel: string;
  taxRatePercent: number;
  language: "id-ID";
  maxVideoSeconds: number;
  safetyMode: "safe_marketing";
  concurrency: 1;
  genderVoices: GenderVoiceSettings[];
}

export interface AdminTransactionRecord {
  transactionId: string;
  kind: "payment" | "generate" | "refund" | "admin";
  status: string;
  occurredAt: string;
  ownerUserId: string;
  ownerEmail: string;
  grossAmountIdr: number;
  walletImpactIdr: number;
  balanceAfterIdr: number | null;
  taxRatePercent: number;
  taxAmountIdr: number;
  netAmountIdr: number;
  entryType?: string | null;
  sourceType?: string | null;
  description: string;
  paymentMethod?: string | null;
  merchantOrderId?: string | null;
  invoiceId?: string | null;
}

export interface AdminTransactionCursor {
  occurredAt: string;
  transactionId: string;
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
  captionDownloadedAt?: string;
  finalVideoDownloadedAt?: string;
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
  ownerUserId?: string;
  ownerEmail?: string;
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
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

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  videoQuotaTotal: number;
  videoQuotaUsed: number;
  walletBalanceIdr: number;
  isUnlimited: boolean;
  disabledAt?: string | null;
  disabledReason?: string | null;
  assignedPackageCode?: AssignedPackageCode | null;
  googleLinked: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionUser {
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

export interface AdminUserRecord extends AuthSessionUser {
  createdAt: string;
  updatedAt: string;
  googleLinked: boolean;
  hasPassword: boolean;
}

export interface UploadedAiFile {
  provider: "gemini";
  mimeType: string;
  fileUri?: string;
  fileId?: string;
  base64Data?: string;
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
  provider: AiProvider;
  fallbackProvider?: AiProvider;
  model: string;
  prompt: string;
  video?: UploadedAiFile | UploadedAiFile[];
}

export interface GenerateCaptionMetadataInput {
  provider: AiProvider;
  fallbackProvider?: AiProvider;
  model: string;
  prompt: string;
  video?: UploadedAiFile | UploadedAiFile[];
}

export interface GenerateVisualBriefInput {
  provider: AiProvider;
  fallbackProvider?: AiProvider;
  model: string;
  prompt: string;
  video: UploadedAiFile | UploadedAiFile[];
}

export interface GenerateSpeechInput {
  provider: AiProvider;
  fallbackProvider?: AiProvider;
  model: string;
  text: string;
  contentLanguage?: ContentLanguage;
  voiceName: string;
  speechRate: number;
  deliveryHint?: string;
}

export interface TtsVoiceOption {
  provider: AiProvider;
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
