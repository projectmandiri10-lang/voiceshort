export const CONTENT_TYPES = [
  "affiliate",
  "video-marketing",
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

export const SOCIAL_PLATFORMS = [
  "facebook",
  "tiktok",
  "youtube",
  "shopee",
  "instagram",
  "lainnya"
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const VOICE_GENDERS = ["male", "female"] as const;
export type JobVoiceGender = (typeof VOICE_GENDERS)[number];
export type VoiceGender = JobVoiceGender | "neutral";
export const SCRIPT_AI_PROVIDERS = ["gemini_direct", "openrouter", "litellm"] as const;
export type ScriptAiProvider = (typeof SCRIPT_AI_PROVIDERS)[number];
export const TTS_AI_PROVIDERS = ["gemini_direct", "openrouter"] as const;
export type TtsAiProvider = (typeof TTS_AI_PROVIDERS)[number];
export type AiProvider = ScriptAiProvider;

export type UserRole = "user" | "superadmin";
export type SubscriptionStatus = "active" | "inactive";
export type AssignedPackageCode = "10_video" | "50_video" | "100_video" | "custom";

export interface GenderVoiceSettings {
  gender: JobVoiceGender;
  voiceName: string;
  speechRate: number;
}

export interface AppSettings {
  scriptProvider: ScriptAiProvider;
  scriptFallbackProvider: ScriptAiProvider;
  scriptModel: string;
  ttsProvider: TtsAiProvider;
  ttsFallbackProvider: TtsAiProvider;
  ttsModel: string;
  language: "id-ID";
  maxVideoSeconds: number;
  safetyMode: "safe_marketing";
  concurrency: 1;
  genderVoices: GenderVoiceSettings[];
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

export type GenerationSessionStatus =
  | "creating"
  | "ready_for_audio"
  | "ready_for_render"
  | "completed"
  | "failed";

export interface GenerationSessionRenderSummary {
  finalDurationSec?: number;
  finalSizeBytes?: number;
  renderedAt?: string;
  localFileName?: string;
  lastClientError?: string;
}

export interface GenerationSessionRecord {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  ownerEmail?: string;
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText?: string;
  referenceLink?: string;
  videoDurationSec: number;
  frameCount: number;
  status: GenerationSessionStatus;
  scriptText?: string;
  captionText?: string;
  hashtags: string[];
  voiceName?: string;
  speechRate?: number;
  chargedAmountIdr: number;
  errorMessage?: string;
  renderSummary?: GenerationSessionRenderSummary;
}

export interface ExtractedFrame {
  index: number;
  timestampSec: number;
  mimeType: "image/jpeg";
  base64Data: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface GenerationSessionCreateInput {
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText?: string;
  referenceLink?: string;
  videoDurationSec: number;
  frames: Array<{
    timestampSec: number;
    mimeType: "image/jpeg";
    base64Data: string;
    width: number;
    height: number;
  }>;
}

export interface GenerationSessionCreateResult {
  session: GenerationSessionRecord;
}

export interface GenerationSessionCompleteInput {
  finalDurationSec: number;
  finalSizeBytes: number;
  localFileName?: string;
}

export interface PreviewVoiceResult {
  voiceName: string;
  audioUrl: string;
}

export interface CachedGenerationSessionRecord {
  sessionId: string;
  sourceVideoName: string;
  sourceVideoType: string;
  sourceVideoBlob: Blob;
  audioBlob?: Blob;
  audioMimeType?: string;
  renderedVideoBlob?: Blob;
  renderFileName?: string;
  updatedAt: string;
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
