export const CONTENT_TYPES = [
  "affiliate", "video-marketing", "komedi", "informasi", "hiburan", "gaul",
  "cerita", "review-produk", "edukasi", "motivasi", "promosi-event"
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const SOCIAL_PLATFORMS = ["facebook", "tiktok", "youtube", "shopee", "instagram", "lainnya"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const CONTENT_LANGUAGES = ["id-ID", "en-US"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const SCRIPT_AI_PROVIDERS = ["aivene", "zai"] as const;
export type ScriptAiProvider = (typeof SCRIPT_AI_PROVIDERS)[number];
export type AiProvider = ScriptAiProvider;
export type UserRole = "user" | "superadmin";
export type SubscriptionStatus = "active" | "inactive";
export type AssignedPackageCode = "10_video" | "50_video" | "100_video" | "custom";
export type QrisManualOverrideMode = "auto" | "open" | "closed";

export interface AppSettings {
  scriptProvider: ScriptAiProvider;
  scriptFallbackProvider: ScriptAiProvider;
  scriptModel: string;
  taxRatePercent: number;
  language: "id-ID";
  maxVideoSeconds: number;
  safetyMode: "safe_marketing";
  concurrency: 1;
  subscriptionPriceIdr: number;
  subscriptionDays: number;
  qrisMerchantName: string;
  qrisImageUrl: string;
  qrisInstructions: string;
  qrisManualOverride: QrisManualOverrideMode;
  qrisManualOverrideUntil: string | null;
}

export interface AdminTransactionRecord {
  transactionId: string; kind: "payment" | "generate" | "refund" | "admin"; status: string;
  occurredAt: string; ownerUserId: string; ownerEmail: string; grossAmountIdr: number;
  walletImpactIdr: number; balanceAfterIdr: number | null; taxRatePercent: number;
  taxAmountIdr: number; netAmountIdr: number; entryType?: string | null;
  sourceType?: string | null; description: string; paymentMethod?: string | null;
  merchantOrderId?: string | null; invoiceId?: string | null;
}

export interface AuthUser {
  id: string; email: string; displayName: string; role: UserRole;
  subscriptionStatus: SubscriptionStatus; videoQuotaTotal: number; videoQuotaUsed: number;
  videoQuotaRemaining: number | null; walletBalanceIdr: number; generatePriceIdr: number;
  generateCreditsRemaining: number | null; isUnlimited: boolean; disabledAt?: string | null;
  disabledReason?: string | null; assignedPackageCode?: AssignedPackageCode | null;
  freeAnalysisLimit: number; freeAnalysisUsed: number; freeAnalysisRemaining: number;
  subscriptionExpiresAt?: string | null; hasAnalysisAccess: boolean;
}

export interface AdminUserRecord extends AuthUser {
  createdAt: string; updatedAt: string; googleLinked: boolean; hasPassword: boolean;
}

export type GenerationSessionStatus = "creating" | "completed" | "failed";

export interface GenerationSessionRenderSummary {
  finalDurationSec?: number; finalSizeBytes?: number; renderedAt?: string;
  localFileName?: string; lastClientError?: string;
}

export interface VisualBriefHook { startSec: number; endSec: number; reason: string; }
export interface VisualBriefTimelineItem {
  startSec: number; endSec: number; primaryVisual: string; action: string;
  onScreenText: string[]; narrationFocus: string; avoidClaims: string[];
}
export interface VisualBrief {
  summary: string; hook: VisualBriefHook; timeline: VisualBriefTimelineItem[];
  mustMention: string[]; mustAvoid: string[]; uncertainties: string[];
}

export interface AiStudioPackage {
  sceneText: string;
  sampleContextText: string;
  scriptText: string;
  captionText: string;
  hashtags: string[];
}

export interface GenerationSessionRecord extends AiStudioPackage {
  sessionId: string; createdAt: string; updatedAt: string; completedAt?: string | null;
  ownerEmail?: string; title: string; description: string; contentType: ContentType;
  socialPlatform: SocialPlatform; contentLanguage: ContentLanguage;
  tone: string; ctaText?: string; referenceLink?: string; videoDurationSec: number;
  frameCount: number; status: GenerationSessionStatus; visualBrief?: VisualBrief;
  chargedAmountIdr: number; errorMessage?: string; renderSummary?: GenerationSessionRenderSummary;
}

export interface ExtractedFrame {
  index: number; timestampSec: number; mimeType: "image/jpeg"; base64Data: string;
  dataUrl: string; width: number; height: number;
}

export interface GenerationSessionCreateInput {
  title: string; description: string; contentType: ContentType; socialPlatform: SocialPlatform;
  contentLanguage: ContentLanguage; tone: string;
  ctaText?: string; referenceLink?: string; videoDurationSec: number;
  frames: Array<{ timestampSec: number; mimeType: "image/jpeg"; base64Data: string; width: number; height: number }>;
}
export interface GenerationSessionCreateResult { session: GenerationSessionRecord; }
export interface SubscriptionOrder {
  id: string; baseAmountIdr: number; uniqueCode: string; totalAmountIdr: number;
  subscriptionDays: number; status: "pending" | "paid" | "expired" | "canceled";
  expiresAt: string; paidAt?: string | null; subscriptionExpiresAt?: string | null;
}
export interface SubscriptionConfig {
  priceIdr: number; subscriptionDays: number; merchantName: string;
  qrisImageUrl: string; instructions: string; uniqueDigits: 2;
  uniqueCodeMin: number; uniqueCodeMax: number; webhookConfigured: boolean;
  paymentWindow: {
    timeZone: string; opensAt: string; closesAt: string;
    isOpen: boolean; nextOpenAt: string | null; nextAutomaticAt: string | null;
    mode: "automatic" | "manual_open" | "manual_closed";
    manualOverrideState: Exclude<QrisManualOverrideMode, "auto"> | null;
    manualOverrideUntil: string | null;
  };
}
export interface SubscriptionCheckout {
  order: SubscriptionOrder;
  config: SubscriptionConfig;
}
export interface TopupConfig {
  merchantName: string;
  qrisImageUrl: string;
  instructions: string;
  uniqueDigits: 2;
  uniqueCodeMin: number;
  uniqueCodeMax: number;
  webhookConfigured: boolean;
  paymentWindow: {
    timeZone: string;
    opensAt: string;
    closesAt: string;
    isOpen: boolean;
    nextOpenAt: string | null;
    nextAutomaticAt: string | null;
    mode: "automatic" | "manual_open" | "manual_closed";
    manualOverrideState: Exclude<QrisManualOverrideMode, "auto"> | null;
    manualOverrideUntil: string | null;
  };
}
export interface DepositPackage {
  code: "1_video" | "10_video" | "50_video" | "100_video"; label: string; payAmountIdr: number;
  creditAmountIdr: number; bonusAmountIdr: number; generateCredits: number;
}
export interface PaymentOrder {
  id: string; packageCode: DepositPackage["code"]; provider: "webqris" | "interactive_qris"; payAmountIdr: number; creditAmountIdr: number;
  taxRatePercent: number; taxAmountIdr: number; netAmountIdr: number; merchantOrderId: string;
  webqrisInvoiceId?: string | null; qrisPayload?: string | null; uniqueCode?: number | null;
  totalAmountIdr?: number | null; status: "pending" | "paid" | "expired" | "failed" | "canceled";
  expiredAt?: string | null; paidAt?: string | null; paymentMethod?: string | null;
}
export interface WalletLedgerEntry {
  id: string; amountIdr: number; balanceAfterIdr: number; entryType: string; sourceType: string;
  sourceId?: string | null; description: string; metadata: Record<string, unknown>; createdAt: string;
}
export interface WalletSummary {
  walletBalanceIdr: number; generatePriceIdr: number; generateCreditsRemaining: number | null;
  isUnlimited: boolean; packages: DepositPackage[]; recentLedger: WalletLedgerEntry[]; recentTopups: PaymentOrder[];
}
