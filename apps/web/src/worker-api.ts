import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ABSOLUTE_MAX_VIDEO_SECONDS,
  AIVENE_SCRIPT_MODELS,
  DEFAULT_SETTINGS,
  DEFAULT_AIVENE_BASE_URL,
  DEFAULT_ZAI_BASE_URL,
  DEFAULT_ZAI_SCRIPT_MODEL,
  FREE_ANALYSIS_LIMIT,
  FREE_USER_AIVENE_SCRIPT_MODEL,
  normalizeScriptModel,
  normalizeScriptProvider
} from "./shared/constants";
import {
  buildAiStudioPackagePrompt,
  buildVisualBriefPrompt
} from "./shared/prompt-builder";
import {
  extractAiStudioPackage,
  extractVisualBrief
} from "./shared/model-output";
import {
  CONTENT_LANGUAGES,
  CONTENT_TYPES,
  SOCIAL_PLATFORMS,
  type AdminTransactionRecord,
  type AdminUserRecord,
  type AiProvider,
  type AppSettings,
  type AssignedPackageCode,
  type AuthUser,
  type ContentLanguage,
  type ContentType,
  type GenerationSessionCreateInput,
  type GenerationSessionRecord,
  type GenerationSessionStatus,
  type ScriptAiProvider,
  type SocialPlatform,
  type VisualBrief,
  type UserRole
} from "./types";

const SUPERADMIN_WHITELIST_EMAIL = "jho.j80@gmail.com";
const DEFAULT_GENERATE_PRICE_IDR = 2000;
const DEPOSIT_PACKAGES = [
  {
    code: "10_video",
    label: "10 generate",
    payAmountIdr: 20_000,
    creditAmountIdr: 20_000,
    bonusAmountIdr: 0
  },
  {
    code: "50_video",
    label: "50 generate",
    payAmountIdr: 90_000,
    creditAmountIdr: 100_000,
    bonusAmountIdr: 10_000
  },
  {
    code: "100_video",
    label: "100 generate",
    payAmountIdr: 170_000,
    creditAmountIdr: 200_000,
    bonusAmountIdr: 30_000
  }
] as const;

type DepositPackageCode = (typeof DEPOSIT_PACKAGES)[number]["code"];

interface WorkerAssetBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  AI_PROVIDER?: string;
  AIVENE_API_KEY?: string;
  AIVENE_BASE_URL?: string;
  AIVENE_SCRIPT_MODEL?: string;
  AIVENE_REASONING_EFFORT?: string;
  ZAI_API_KEY?: string;
  ZAI_BASE_URL?: string;
  ZAI_SCRIPT_MODEL?: string;
  SCRIPT_PROVIDER?: string;
  SCRIPT_FALLBACK_PROVIDER?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  WEBQRIS_BASE_URL?: string;
  WEBQRIS_API_TOKEN?: string;
  WEBQRIS_WEBHOOK_SECRET?: string;
  INTERACTIVE_QRIS_WEBHOOK_SECRET?: string;
  INTERACTIVE_QRIS_SOURCE_PACKAGE?: string;
  INTERACTIVE_QRIS_UNIQUE_DIGITS?: string;
  INTERACTIVE_QRIS_UNIQUE_CODE_MIN?: string;
  INTERACTIVE_QRIS_UNIQUE_CODE_MAX?: string;
  INTERACTIVE_QRIS_EXPIRY_MINUTES?: string;
  INTERACTIVE_QRIS_TIME_ZONE?: string;
  INTERACTIVE_QRIS_OPEN_HOUR?: string;
  INTERACTIVE_QRIS_CLOSE_HOUR?: string;
  GENERATE_PRICE_IDR?: string;
  ASSETS?: WorkerAssetBinding;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "superadmin";
  subscription_status: "active" | "inactive";
  video_quota_total: number;
  video_quota_used: number;
  wallet_balance_idr: number;
  is_unlimited: boolean;
  disabled_at: string | null;
  disabled_reason: string | null;
  assigned_package_code: AssignedPackageCode | null;
  google_linked: boolean;
  has_password: boolean;
  created_at: string;
  updated_at: string;
  free_analysis_used?: number;
  subscription_expires_at?: string | null;
}

interface AppSettingsRow {
  settings_key: "default";
  script_provider?: AppSettings["scriptProvider"];
  script_fallback_provider?: AppSettings["scriptFallbackProvider"];
  script_model: string;
  tax_rate_percent?: number | string | null;
  language: "id-ID";
  max_video_seconds: number;
  safety_mode: "safe_marketing";
  concurrency: 1;
  subscription_price_idr?: number | null;
  subscription_days?: number | null;
  qris_merchant_name?: string | null;
  qris_image_url?: string | null;
  qris_instructions?: string | null;
}

interface SubscriptionOrderRow {
  id: string;
  owner_user_id: string;
  owner_email: string;
  base_amount_idr: number;
  unique_code: number;
  total_amount_idr: number;
  subscription_days: number;
  status: "pending" | "paid" | "expired" | "canceled";
  expires_at: string;
  paid_at: string | null;
  subscription_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GenerationSessionRow {
  session_id: string;
  owner_user_id: string;
  owner_email: string;
  title: string;
  description: string;
  content_type: ContentType;
  social_platform: SocialPlatform;
  content_language?: ContentLanguage | null;
  tone: string;
  cta_text: string | null;
  reference_link: string | null;
  video_duration_sec: number;
  frame_count: number;
  status: GenerationSessionStatus;
  visual_brief: VisualBrief | null;
  scene_text: string | null;
  sample_context_text: string | null;
  script_text: string | null;
  caption_text: string | null;
  hashtags: string[] | null;
  charged_amount_idr: number;
  error_message: string | null;
  render_summary: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentOrderRow {
  id: string;
  owner_user_id: string;
  owner_email: string;
  package_code: DepositPackageCode;
  pay_amount_idr: number;
  credit_amount_idr: number;
  provider: "webqris" | "interactive_qris";
  merchant_order_id: string;
  webqris_invoice_id: string | null;
  qris_payload: string | null;
  unique_code: number | null;
  total_amount_idr: number | null;
  tax_rate_percent?: number | string | null;
  tax_amount_idr?: number | null;
  status: "pending" | "paid" | "expired" | "failed" | "canceled";
  expired_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminTransactionFeedRow {
  transaction_id: string;
  kind: AdminTransactionRecord["kind"];
  status: string;
  occurred_at: string;
  owner_user_id: string;
  owner_email: string;
  gross_amount_idr: number;
  wallet_impact_idr: number;
  balance_after_idr: number | null;
  tax_rate_percent?: number | string | null;
  tax_amount_idr: number;
  net_amount_idr: number;
  entry_type: string | null;
  source_type: string | null;
  description: string | null;
  payment_method: string | null;
  merchant_order_id: string | null;
  invoice_id: string | null;
}

interface WalletLedgerRow {
  id: string;
  amount_idr: number;
  balance_after_idr: number;
  entry_type: string;
  source_type: string;
  source_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AuthContext {
  accessToken: string;
  user: AuthUser;
  serviceDb: SupabaseClient;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createHttpError(status: number, message: string, details?: unknown) {
  return Object.assign(new Error(message), { status, details });
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers || {})
    }
  });
}

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-signature, x-signature, x-interactive-qris-secret",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  };
}

function errorResponse(request: Request, error: unknown, fallbackMessage: string): Response {
  const status = Number((error as { status?: number }).status || 500);
  const message = (error as { message?: string }).message || fallbackMessage;
  return jsonResponse(
    {
      message,
      error: (error as { details?: unknown }).details ?? undefined
    },
    {
      status,
      headers: buildCorsHeaders(request)
    }
  );
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function getRequiredEnv(env: WorkerEnv, key: keyof WorkerEnv): string {
  const value = String(env[key] || "").trim();
  if (!value) {
    throw createHttpError(500, `${String(key)} belum dikonfigurasi di sistem backend.`);
  }
  return value;
}

function getAiveneApiKey(env: WorkerEnv): string {
  const value = String(env.AIVENE_API_KEY || "").trim();
  if (!value) {
    throw createHttpError(500, "AIVENE_API_KEY belum dikonfigurasi di sistem backend.");
  }
  return value;
}

function resolveAiveneBaseUrl(env: WorkerEnv): string {
  return trimTrailingSlash(String(env.AIVENE_BASE_URL || DEFAULT_AIVENE_BASE_URL).trim() || DEFAULT_AIVENE_BASE_URL);
}

function resolveAiveneReasoningEffort(env: WorkerEnv): "low" | "medium" | "high" {
  const value = String(env.AIVENE_REASONING_EFFORT || "medium").trim().toLowerCase();
  return value === "low" || value === "high" ? value : "medium";
}

function getZaiApiKey(env: WorkerEnv): string {
  const value = String(env.ZAI_API_KEY || "").trim();
  if (!value) {
    throw createHttpError(500, "ZAI_API_KEY belum dikonfigurasi di sistem backend.");
  }
  return value;
}

function resolveZaiBaseUrl(env: WorkerEnv): string {
  return trimTrailingSlash(String(env.ZAI_BASE_URL || DEFAULT_ZAI_BASE_URL).trim() || DEFAULT_ZAI_BASE_URL);
}

function resolveAiveneChatUrl(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function getGeneratePriceIdr(env: WorkerEnv): number {
  const raw = String(env.GENERATE_PRICE_IDR || "").trim();
  const parsed = raw ? Number(raw) : DEFAULT_GENERATE_PRICE_IDR;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_GENERATE_PRICE_IDR;
}

function normalizeTaxRatePercent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

function assertTaxRatePercent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw createHttpError(400, "Pajak transaksi harus berada di rentang 0 sampai 100 persen.");
  }
  return Math.round(numeric * 100) / 100;
}

function calculateTaxAmountIdr(payAmountIdr: number, taxRatePercent: number): number {
  return Math.max(0, Math.round(payAmountIdr * (taxRatePercent / 100)));
}

function getDepositPackage(code: string) {
  return DEPOSIT_PACKAGES.find((item) => item.code === code);
}

function createServiceClient(env: WorkerEnv): SupabaseClient {
  return createClient(getRequiredEnv(env, "SUPABASE_URL"), getRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function createAnonClient(env: WorkerEnv, accessToken: string): SupabaseClient {
  return createClient(getRequiredEnv(env, "SUPABASE_URL"), getRequiredEnv(env, "SUPABASE_ANON_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

function parseBearerToken(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization") || "";
  const [scheme, token] = authHeader.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() === "bearer" && token?.trim()) {
    return token.trim();
  }
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("access_token")?.trim();
  return queryToken || undefined;
}

function isWhitelistedSuperadmin(email: string): boolean {
  return email.trim().toLowerCase() === SUPERADMIN_WHITELIST_EMAIL;
}

function mapProfileToAuthUser(profile: ProfileRow, generatePriceIdr: number): AuthUser {
  const email = profile.email.trim().toLowerCase();
  const unlimited = Boolean(profile.is_unlimited) || isWhitelistedSuperadmin(email);
  const freeAnalysisUsed = Math.max(0, Math.min(FREE_ANALYSIS_LIMIT, Math.trunc(profile.free_analysis_used || 0)));
  const subscriptionExpiresAt = profile.subscription_expires_at || null;
  const subscriptionActive = Boolean(
    subscriptionExpiresAt && new Date(subscriptionExpiresAt).getTime() > Date.now()
  );
  const generateCreditsRemaining = unlimited
    ? null
    : Math.floor(Math.max(0, Math.trunc(profile.wallet_balance_idr || 0)) / generatePriceIdr);
  return {
    id: profile.id,
    email,
    displayName: profile.display_name.trim() || email.split("@")[0] || email,
    role: isWhitelistedSuperadmin(email) || profile.role === "superadmin" ? "superadmin" : "user",
    subscriptionStatus: isWhitelistedSuperadmin(email) || subscriptionActive ? "active" : "inactive",
    videoQuotaTotal: Math.max(0, Math.trunc(profile.video_quota_total || 0)),
    videoQuotaUsed: Math.max(0, Math.trunc(profile.video_quota_used || 0)),
    videoQuotaRemaining: generateCreditsRemaining,
    walletBalanceIdr: Math.max(0, Math.trunc(profile.wallet_balance_idr || 0)),
    generatePriceIdr,
    generateCreditsRemaining,
    isUnlimited: unlimited,
    disabledAt: unlimited && isWhitelistedSuperadmin(email) ? null : profile.disabled_at,
    disabledReason: unlimited && isWhitelistedSuperadmin(email) ? null : profile.disabled_reason,
    assignedPackageCode: profile.assigned_package_code ?? null,
    freeAnalysisLimit: FREE_ANALYSIS_LIMIT,
    freeAnalysisUsed,
    freeAnalysisRemaining: Math.max(0, FREE_ANALYSIS_LIMIT - freeAnalysisUsed),
    subscriptionExpiresAt,
    hasAnalysisAccess:
      unlimited
      || subscriptionActive
      || freeAnalysisUsed < FREE_ANALYSIS_LIMIT
      || Math.max(0, Math.trunc(profile.wallet_balance_idr || 0)) >= generatePriceIdr
  };
}

function mapProfileToAdminUser(profile: ProfileRow, generatePriceIdr: number): AdminUserRecord {
  return {
    ...mapProfileToAuthUser(profile, generatePriceIdr),
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    googleLinked: Boolean(profile.google_linked),
    hasPassword: Boolean(profile.has_password)
  };
}

function normalizeSettings(row?: AppSettingsRow | null): AppSettings {
  const source = row
    ? {
        scriptProvider: normalizeScriptProvider(row.script_provider, DEFAULT_SETTINGS.scriptProvider),
        scriptFallbackProvider: normalizeScriptProvider(
          row.script_fallback_provider,
          DEFAULT_SETTINGS.scriptFallbackProvider
        ),
        scriptModel: row.script_model,
        taxRatePercent: normalizeTaxRatePercent(row.tax_rate_percent),
        language: row.language,
        maxVideoSeconds: row.max_video_seconds,
        safetyMode: row.safety_mode,
        concurrency: row.concurrency,
        subscriptionPriceIdr: row.subscription_price_idr,
        subscriptionDays: row.subscription_days,
        qrisMerchantName: row.qris_merchant_name,
        qrisImageUrl: row.qris_image_url,
        qrisInstructions: row.qris_instructions
      }
    : DEFAULT_SETTINGS;

  const scriptProvider = normalizeScriptProvider(source.scriptProvider, DEFAULT_SETTINGS.scriptProvider);
  const rawScriptModel = String(source.scriptModel || DEFAULT_SETTINGS.scriptModel).trim() || DEFAULT_SETTINGS.scriptModel;
  const scriptModel = scriptProvider === "aivene" && !AIVENE_SCRIPT_MODELS.includes(rawScriptModel as (typeof AIVENE_SCRIPT_MODELS)[number])
    ? DEFAULT_SETTINGS.scriptModel
    : rawScriptModel;

  return {
    scriptProvider,
    scriptFallbackProvider: normalizeScriptProvider(
      source.scriptFallbackProvider,
      DEFAULT_SETTINGS.scriptFallbackProvider
    ),
    scriptModel: normalizeScriptModel(scriptModel, scriptProvider),
    taxRatePercent: normalizeTaxRatePercent(source.taxRatePercent ?? DEFAULT_SETTINGS.taxRatePercent),
    language: "id-ID",
    maxVideoSeconds: Math.max(10, Math.min(ABSOLUTE_MAX_VIDEO_SECONDS, Math.trunc(source.maxVideoSeconds || DEFAULT_SETTINGS.maxVideoSeconds))),
    safetyMode: "safe_marketing",
    concurrency: 1,
    subscriptionPriceIdr: Math.max(1_000, Math.min(10_000_000, Math.trunc(Number(source.subscriptionPriceIdr) || DEFAULT_SETTINGS.subscriptionPriceIdr))),
    subscriptionDays: Math.max(1, Math.min(365, Math.trunc(Number(source.subscriptionDays) || DEFAULT_SETTINGS.subscriptionDays))),
    qrisMerchantName: String(source.qrisMerchantName || DEFAULT_SETTINGS.qrisMerchantName).trim() || DEFAULT_SETTINGS.qrisMerchantName,
    qrisImageUrl: String(source.qrisImageUrl || "").trim(),
    qrisInstructions: String(source.qrisInstructions || DEFAULT_SETTINGS.qrisInstructions).trim() || DEFAULT_SETTINGS.qrisInstructions
  };
}

function resolveZaiChatUrl(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v4")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/api/paas/v4/chat/completions`;
}

function applyRuntimeSettingsEnvOverrides(
  settings: AppSettings,
  env: WorkerEnv,
  useEnvModelDefault = false
): AppSettings {
  const aiProvider = String(env.AI_PROVIDER || "").trim();
  const scriptProvider = normalizeScriptProvider(
    String(env.SCRIPT_PROVIDER || aiProvider || "").trim(),
    settings.scriptProvider
  );
  const scriptFallbackProvider = normalizeScriptProvider(
    String(env.SCRIPT_FALLBACK_PROVIDER || (scriptProvider === "aivene" ? "zai" : "aivene")).trim(),
    settings.scriptFallbackProvider === scriptProvider
      ? scriptProvider === "zai" ? "aivene" : "zai"
      : settings.scriptFallbackProvider
  );
  const scriptModelDefault = scriptProvider === "zai"
    ? String(env.ZAI_SCRIPT_MODEL || DEFAULT_ZAI_SCRIPT_MODEL).trim()
    : String(env.AIVENE_SCRIPT_MODEL || DEFAULT_SETTINGS.scriptModel).trim();
  const selectedModel = useEnvModelDefault ? scriptModelDefault : settings.scriptModel;
  return {
    ...settings,
    scriptProvider,
    scriptFallbackProvider:
      scriptFallbackProvider === scriptProvider
        ? scriptProvider === "zai" ? "aivene" : "zai"
        : scriptFallbackProvider,
    scriptModel: normalizeScriptModel(selectedModel, scriptProvider)
  };
}

function mapGenerationSession(row: GenerationSessionRow): GenerationSessionRecord {
  return {
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    ownerEmail: row.owner_email,
    title: row.title,
    description: row.description,
    contentType: row.content_type,
    socialPlatform: row.social_platform,
    contentLanguage: row.content_language === "en-US" ? "en-US" : "id-ID",
    tone: row.tone,
    ctaText: row.cta_text || undefined,
    referenceLink: row.reference_link || undefined,
    videoDurationSec: row.video_duration_sec,
    frameCount: row.frame_count,
    status: row.status,
    visualBrief: row.visual_brief || undefined,
    sceneText: row.scene_text || "",
    sampleContextText: row.sample_context_text || "",
    scriptText: row.script_text || "",
    captionText: row.caption_text || "",
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    chargedAmountIdr: Math.max(0, Math.trunc(row.charged_amount_idr || 0)),
    errorMessage: row.error_message || undefined,
    renderSummary: row.render_summary
      ? {
          finalDurationSec: Number(row.render_summary.finalDurationSec || 0) || undefined,
          finalSizeBytes: Number(row.render_summary.finalSizeBytes || 0) || undefined,
          renderedAt:
            typeof row.render_summary.renderedAt === "string"
              ? row.render_summary.renderedAt
              : undefined,
          localFileName:
            typeof row.render_summary.localFileName === "string"
              ? row.render_summary.localFileName
              : undefined,
          lastClientError:
            typeof row.render_summary.lastClientError === "string"
              ? row.render_summary.lastClientError
              : undefined
        }
      : undefined
  };
}

async function requireAuth(request: Request, env: WorkerEnv): Promise<AuthContext> {
  const accessToken = parseBearerToken(request);
  if (!accessToken) {
    throw createHttpError(401, "Silakan login terlebih dahulu.");
  }

  const serviceDb = createServiceClient(env);
  const { data: authData, error: authError } = await serviceDb.auth.getUser(accessToken);
  if (authError || !authData.user?.id || !authData.user.email) {
    throw createHttpError(401, "Sesi login sudah tidak valid. Silakan masuk lagi.");
  }

  const profileResult = await serviceDb
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle<ProfileRow>();
  if (profileResult.error || !profileResult.data) {
    throw createHttpError(401, "Profil akun tidak ditemukan.");
  }

  const user = mapProfileToAuthUser(profileResult.data, getGeneratePriceIdr(env));
  if (user.disabledAt) {
    throw createHttpError(
      403,
      user.disabledReason || "Akun Anda sedang nonaktif. Hubungi admin untuk mengaktifkan kembali."
    );
  }

  return {
    accessToken,
    user,
    serviceDb
  };
}

function requireSuperadmin(context: AuthContext) {
  if (context.user.role !== "superadmin") {
    throw createHttpError(403, "Akses hanya untuk superadmin.");
  }
}

function assertString(value: unknown, field: string, options?: { max?: number; required?: boolean }): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) {
    if (options?.required !== false) {
      throw createHttpError(400, `${field} wajib diisi.`);
    }
    return undefined;
  }
  if (options?.max && text.length > options.max) {
    throw createHttpError(400, `${field} melebihi batas karakter.`);
  }
  return text;
}

function assertContentType(value: unknown): ContentType {
  const contentType = String(value ?? "").trim() as ContentType;
  if (!CONTENT_TYPES.includes(contentType)) {
    throw createHttpError(400, "Kategori konten tidak valid.");
  }
  return contentType;
}

function assertSocialPlatform(value: unknown): SocialPlatform {
  const socialPlatform = String(value ?? "").trim() as SocialPlatform;
  if (!SOCIAL_PLATFORMS.includes(socialPlatform)) {
    throw createHttpError(400, "Platform medsos tidak valid.");
  }
  return socialPlatform;
}

function assertContentLanguage(value: unknown): ContentLanguage {
  const contentLanguage = String(value || "").trim() as ContentLanguage;
  if (!CONTENT_LANGUAGES.includes(contentLanguage)) {
    throw createHttpError(400, "Bahasa output tidak valid.");
  }
  return contentLanguage;
}

function assertUrl(value: unknown): string | undefined {
  const text = assertString(value, "Link referensi", { required: false, max: 400 });
  if (!text) {
    return undefined;
  }
  try {
    new URL(text);
    return text;
  } catch {
    throw createHttpError(400, "Link referensi tidak valid.");
  }
}

function parseSettingsInput(input: unknown): AppSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createHttpError(400, "Payload pengaturan tidak valid.");
  }
  const body = input as Record<string, unknown>;
  const scriptProvider = normalizeScriptProvider(
    String(body.scriptProvider || "").trim(),
    DEFAULT_SETTINGS.scriptProvider
  );
  const scriptFallbackProvider = normalizeScriptProvider(
    String(body.scriptFallbackProvider || "").trim(),
    DEFAULT_SETTINGS.scriptFallbackProvider
  );
  if (scriptProvider === scriptFallbackProvider) {
    throw createHttpError(400, "Fallback provider script harus berbeda dari provider utama.");
  }
  const requestedModel = assertString(body.scriptModel, "Script model") || DEFAULT_SETTINGS.scriptModel;
  if (scriptProvider === "aivene" && !AIVENE_SCRIPT_MODELS.includes(requestedModel as (typeof AIVENE_SCRIPT_MODELS)[number])) {
    throw createHttpError(400, "Model analisis Aivene tidak didukung.");
  }
  return {
    scriptProvider,
    scriptFallbackProvider,
    scriptModel: normalizeScriptModel(requestedModel, scriptProvider),
    taxRatePercent: assertTaxRatePercent(body.taxRatePercent ?? DEFAULT_SETTINGS.taxRatePercent),
    language: "id-ID",
    maxVideoSeconds: Math.max(
      10,
      Math.min(
        ABSOLUTE_MAX_VIDEO_SECONDS,
        Math.trunc(typeof body.maxVideoSeconds === "number" ? body.maxVideoSeconds : Number(body.maxVideoSeconds))
      )
    ),
    safetyMode: "safe_marketing",
    concurrency: 1,
    subscriptionPriceIdr: Math.max(1_000, Math.min(10_000_000, Math.trunc(Number(body.subscriptionPriceIdr) || DEFAULT_SETTINGS.subscriptionPriceIdr))),
    subscriptionDays: Math.max(1, Math.min(365, Math.trunc(Number(body.subscriptionDays) || DEFAULT_SETTINGS.subscriptionDays))),
    qrisMerchantName: assertString(body.qrisMerchantName, "Nama merchant QRIS", { required: false, max: 120 }) || DEFAULT_SETTINGS.qrisMerchantName,
    qrisImageUrl: assertString(body.qrisImageUrl, "URL gambar QRIS", { required: false, max: 1000 }) || "",
    qrisInstructions: assertString(body.qrisInstructions, "Instruksi QRIS", { required: false, max: 500 }) || DEFAULT_SETTINGS.qrisInstructions
  };
}

function parseGenerationSessionCreateInput(input: unknown): GenerationSessionCreateInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createHttpError(400, "Payload generate tidak valid.");
  }
  const body = input as Record<string, unknown>;
  const videoDurationSec = Number(body.videoDurationSec);
  if (!Number.isFinite(videoDurationSec) || videoDurationSec <= 0) {
    throw createHttpError(400, "Durasi video tidak valid.");
  }

  const frames = Array.isArray(body.frames) ? body.frames : [];
  if (frames.length > 24) {
    throw createHttpError(400, "Jumlah cuplikan melebihi batas aman.");
  }
  if (!frames.length) {
    throw createHttpError(400, "Cuplikan video wajib dikirim untuk analisis.");
  }
  return {
    title: assertString(body.title, "Judul", { max: 160 }) || "",
    description: assertString(body.description, "Brief / deskripsi", { max: 3000 }) || "",
    contentType: assertContentType(body.contentType),
    socialPlatform: assertSocialPlatform(body.socialPlatform),
    contentLanguage: assertContentLanguage(body.contentLanguage),
    tone: assertString(body.tone, "Tone", { max: 80 }) || "",
    ctaText: assertString(body.ctaText, "CTA", { required: false, max: 200 }),
    referenceLink: assertUrl(body.referenceLink),
    videoDurationSec,
    frames: frames.map((frame, index) => {
      if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
        throw createHttpError(400, `Cuplikan #${index + 1} tidak valid.`);
      }
      const record = frame as Record<string, unknown>;
      const mimeType = String(record.mimeType || "").trim();
      const base64Data = String(record.base64Data || "").trim();
      if (mimeType !== "image/jpeg" || !base64Data) {
        throw createHttpError(400, `Cuplikan #${index + 1} wajib berupa JPEG base64.`);
      }
      const timestampSec = Number(record.timestampSec);
      if (!Number.isFinite(timestampSec) || timestampSec < 0) {
        throw createHttpError(400, `Timestamp cuplikan #${index + 1} tidak valid.`);
      }
      return {
        timestampSec,
        mimeType: "image/jpeg" as const,
        base64Data,
        width: Math.max(1, Math.trunc(Number(record.width) || 0)),
        height: Math.max(1, Math.trunc(Number(record.height) || 0))
      };
    })
  };
}

async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw createHttpError(400, "Body JSON tidak valid.");
  }
}

async function getSettings(serviceDb: SupabaseClient, env: WorkerEnv): Promise<AppSettings> {
  const result = await serviceDb
    .from("app_settings")
    .select("*")
    .eq("settings_key", "default")
    .maybeSingle<AppSettingsRow>();
  if (result.error) {
    throw result.error;
  }
  return applyRuntimeSettingsEnvOverrides(normalizeSettings(result.data), env, !result.data);
}

function cleanQrisWebhookField(value: string): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractMalformedQrisPayload(rawText: string): Record<string, unknown> {
  const text = String(rawText || "");
  const packageName = /"packageName"\s*:\s*"([\s\S]*?)"\s*,\s*"title"/i.exec(text)?.[1] || "";
  const title = /"title"\s*:\s*"([\s\S]*?)"\s*,\s*"text"/i.exec(text)?.[1] || "";
  const bodyText = /"text"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:postedAt|raw)"/i.exec(text)?.[1] || "";
  const postedAt = /"postedAt"\s*:\s*"([\s\S]*?)"\s*,\s*"raw"/i.exec(text)?.[1] || "";
  const raw = /"raw"\s*:\s*"([\s\S]*?)"\s*}/i.exec(text)?.[1] || "";
  if (!packageName && !title && !bodyText && !raw) return {};
  return {
    packageName: cleanQrisWebhookField(packageName),
    title: cleanQrisWebhookField(title),
    text: cleanQrisWebhookField(bodyText),
    postedAt: cleanQrisWebhookField(postedAt),
    raw: cleanQrisWebhookField(raw)
  };
}

async function readQrisWebhookPayload(request: Request): Promise<Record<string, unknown>> {
  const rawText = await request.text().catch(() => "");
  if (!rawText.trim()) return {};
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return extractMalformedQrisPayload(rawText);
  }
}

function extractCurrencyInt(fragment: string): number | null {
  const digits = String(fragment || "").replace(/[^\d]/g, "");
  const value = Number.parseInt(digits, 10);
  return Number.isSafeInteger(value) && value >= 1_000 && value <= 10_000_000 ? value : null;
}

function normalizeQrisPackageText(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function payloadLooksLikeInteractiveQris(payload: Record<string, unknown>): boolean {
  const texts = [payload.packageName, payload.title, payload.text, payload.raw]
    .map((value) => typeof value === "string" ? value : value ? JSON.stringify(value) : "")
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (!texts) return false;
  return texts.includes("interactive qris")
    || texts.includes("interactiveqris")
    || texts.includes("pembayaran qris")
    || texts.includes("transaksi qris");
}

function extractQrisAmountCandidates(payload: Record<string, unknown>): number[] {
  const texts = [payload.title, payload.text, payload.raw]
    .map((value) => typeof value === "string" ? value : value ? JSON.stringify(value) : "")
    .filter(Boolean);
  const candidates = new Set<number>();
  const patterns = [
    /(?:rp|idr)\s*([0-9][0-9.,\s]{0,20})/gi,
    /\b\d{1,3}(?:[.,]\d{3})+\b/g,
    /(?:sebesar|nominal|total|bayar(?:\s+tepat)?|amount)\D{0,12}(\d{4,6})\b/gi
  ];
  for (const text of texts) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const value = extractCurrencyInt(match[1] || match[0]);
        if (value) candidates.add(value);
      }
    }
  }
  return [...candidates].sort((left, right) => left - right);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function callAiveneText(
  env: WorkerEnv,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(resolveAiveneChatUrl(resolveAiveneBaseUrl(env)), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAiveneApiKey(env)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof (payload.error as { message?: unknown } | undefined)?.message === "string"
        ? String((payload.error as { message?: unknown }).message)
        : typeof payload.message === "string"
          ? payload.message
          : `Aivene text request gagal (${response.status}).`;
    throw createHttpError(response.status === 429 ? 503 : response.status, message, payload);
  }

  return payload;
}

async function callZaiText(
  env: WorkerEnv,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(resolveZaiChatUrl(resolveZaiBaseUrl(env)), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getZaiApiKey(env)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof (payload.error as { message?: unknown } | undefined)?.message === "string"
        ? String((payload.error as { message?: unknown }).message)
        : typeof payload.message === "string"
          ? payload.message
          : `Z.AI text request gagal (${response.status}).`;
    throw createHttpError(response.status === 429 ? 503 : response.status, message, payload);
  }

  return payload;
}

async function withRetry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const status = Number((error as { status?: number }).status || 500);
      if (attempt >= attempts || (status !== 429 && status < 500)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function buildOpenAiStyleFrameParts(
  frames: GenerationSessionCreateInput["frames"]
): Array<Record<string, unknown>> {
  return frames.map((frame) => ({
    type: "image_url",
    image_url: {
      url: `data:${frame.mimeType};base64,${frame.base64Data}`
    }
  }));
}

function shouldUseFallbackProvider<TProvider extends string>(
  primary: TProvider,
  fallback: TProvider | undefined
): fallback is TProvider {
  return Boolean(fallback && fallback !== primary);
}

function chatPayloadToGeminiLike(payload: Record<string, unknown>): Record<string, unknown> {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const rawContent = first?.message?.content;
  const content =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
            .map((part) => {
              if (!part || typeof part !== "object" || Array.isArray(part)) {
                return "";
              }
              const value = (part as { text?: unknown }).text;
              return typeof value === "string" ? value : "";
            })
            .filter(Boolean)
            .join("\n")
        : "";

  return {
    candidates: [
      {
        content: {
          parts: [{ text: content }]
        }
      }
    ]
  };
}

async function runWithProviderFallback<T, TProvider extends string>(input: {
  stage: string;
  primaryProvider: TProvider;
  fallbackProvider?: TProvider;
  task: (provider: TProvider) => Promise<T>;
}): Promise<T> {
  try {
    return await input.task(input.primaryProvider);
  } catch (primaryError) {
    if (!shouldUseFallbackProvider(input.primaryProvider, input.fallbackProvider)) {
      throw primaryError;
    }
    console.warn(`[AI Fallback] ${input.stage}: ${input.primaryProvider} gagal, coba ${input.fallbackProvider}.`, primaryError);
    try {
      return await input.task(input.fallbackProvider);
    } catch (fallbackError) {
      const primaryMessage = (primaryError as Error).message || "Primary provider gagal.";
      const fallbackMessage = (fallbackError as Error).message || "Fallback provider gagal.";
      throw createHttpError(
        Number((fallbackError as { status?: number }).status || (primaryError as { status?: number }).status || 502),
        `${input.stage} gagal pada provider utama (${input.primaryProvider}) dan fallback (${input.fallbackProvider}).`,
        {
          primaryProvider: input.primaryProvider,
          fallbackProvider: input.fallbackProvider,
          primaryError: primaryMessage,
          fallbackError: fallbackMessage
        }
      );
    }
  }
}

async function generateTextWithProvider(
  env: WorkerEnv,
  provider: ScriptAiProvider,
  model: string,
  input: {
    prompt: string;
    frames?: GenerationSessionCreateInput["frames"];
  }
): Promise<Record<string, unknown>> {
  if (provider === "zai") {
    const payload = await callZaiText(env, {
      model: normalizeScriptModel(String(env.ZAI_SCRIPT_MODEL || DEFAULT_ZAI_SCRIPT_MODEL), provider),
      thinking: { type: "enabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            ...buildOpenAiStyleFrameParts(input.frames || [])
          ]
        }
      ]
    });
    return chatPayloadToGeminiLike(payload);
  }

  const payload = await callAiveneText(env, {
    model: normalizeScriptModel(model, provider),
    reasoning_effort: resolveAiveneReasoningEffort(env),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          ...buildOpenAiStyleFrameParts(input.frames || [])
        ]
      }
    ]
  });
  return chatPayloadToGeminiLike(payload);
}

interface AnalysisAccessReservation {
  accessType: "free" | "subscription" | "unlimited" | "wallet";
  freeAnalysisUsed: number;
  freeAnalysisRemaining: number;
  chargedAmountIdr: number;
}

async function reserveAnalysisAccess(
  context: AuthContext,
  env: WorkerEnv,
  sessionId: string,
  videoDurationSec: number
): Promise<AnalysisAccessReservation> {
  const result = await context.serviceDb.rpc("reserve_analysis_access", {
    target_user_id: context.user.id,
    target_session_id: sessionId
  });
  if (result.error) {
    const message = String(result.error.message || "");
    if (message.includes("FREE_ANALYSIS_LIMIT_REACHED")) {
      const chargeAmountIdr = getGeneratePriceIdr(env);
      const walletCharge = await context.serviceDb.rpc("reserve_generate_credit", {
        job_id: sessionId,
        target_user_id: context.user.id,
        charge_amount_idr: chargeAmountIdr,
        billed_minutes: 1,
        video_duration_sec: videoDurationSec
      });
      if (walletCharge.error) {
        throw createHttpError(402, "10 analisis gratis sudah habis. Top up credit terlebih dahulu untuk melanjutkan.");
      }
      return {
        accessType: "wallet",
        freeAnalysisUsed: FREE_ANALYSIS_LIMIT,
        freeAnalysisRemaining: 0,
        chargedAmountIdr: chargeAmountIdr
      };
    }
    throw result.error;
  }
  const value = (result.data || {}) as Partial<AnalysisAccessReservation>;
  return {
    accessType:
      value.accessType === "subscription" || value.accessType === "unlimited"
      ? value.accessType
      : "free",
    freeAnalysisUsed: Math.max(0, Math.trunc(Number(value.freeAnalysisUsed) || 0)),
    freeAnalysisRemaining: Math.max(0, Math.trunc(Number(value.freeAnalysisRemaining) || 0)),
    chargedAmountIdr: 0
  };
}

async function releaseAnalysisAccess(
  context: AuthContext,
  sessionId: string,
  accessType: AnalysisAccessReservation["accessType"]
): Promise<void> {
  if (accessType === "wallet") {
    const refund = await context.serviceDb.rpc("refund_generate_credit", {
      job_id: sessionId,
      target_user_id: context.user.id,
      reason: "Refund analisis yang gagal diproses"
    });
    if (refund.error) console.warn("Gagal refund saldo analisis.", refund.error);
    return;
  }
  const result = await context.serviceDb.rpc("release_analysis_access", { target_session_id: sessionId });
  if (result.error) console.warn("Gagal mengembalikan kuota analisis.", result.error);
}

async function completeAnalysisAccess(context: AuthContext, sessionId: string): Promise<void> {
  const result = await context.serviceDb.rpc("complete_analysis_access", { target_session_id: sessionId });
  if (result.error) console.warn("Gagal menandai penggunaan analisis selesai.", result.error);
}

async function createGenerationSession(
  env: WorkerEnv,
  context: AuthContext,
  input: GenerationSessionCreateInput
): Promise<GenerationSessionRecord> {
  const sessionId = crypto.randomUUID();
  const access = await reserveAnalysisAccess(context, env, sessionId, input.videoDurationSec);
  try {
  const savedSettings = await getSettings(context.serviceDb, env);
  const isSuperadmin = context.user.role === "superadmin";
  const selectedUserModel = access.accessType === "free"
    ? FREE_USER_AIVENE_SCRIPT_MODEL
    : AIVENE_SCRIPT_MODELS.includes(savedSettings.scriptModel as (typeof AIVENE_SCRIPT_MODELS)[number])
      ? savedSettings.scriptModel
      : DEFAULT_SETTINGS.scriptModel;
  const settings = isSuperadmin
    ? savedSettings
    : {
        ...savedSettings,
        scriptProvider: "aivene" as const,
        scriptFallbackProvider: "aivene" as const,
        scriptModel: selectedUserModel
      };
  if (input.videoDurationSec > settings.maxVideoSeconds) {
    throw createHttpError(
      400,
      `Durasi video ${input.videoDurationSec.toFixed(2)} detik melebihi batas ${settings.maxVideoSeconds} detik.`
    );
  }

  const promptBase = {
    settings,
    title: input.title,
    description: input.description,
    contentType: input.contentType,
    socialPlatform: input.socialPlatform,
    contentLanguage: input.contentLanguage,
    tone: input.tone,
    videoDurationSec: input.videoDurationSec,
    frameCount: input.frames.length,
    ctaText: input.ctaText,
    referenceLink: input.referenceLink
  } as const;

  const visualBrief = await runWithProviderFallback({
    stage: "Visual brief",
    primaryProvider: settings.scriptProvider,
    fallbackProvider: settings.scriptFallbackProvider,
    task: (provider) =>
      withRetry(() =>
        generateTextWithProvider(env, provider, settings.scriptModel, {
          prompt: buildVisualBriefPrompt(promptBase),
          frames: input.frames
        }).then(extractVisualBrief)
      )
  });

  const aiPackage = await runWithProviderFallback({
    stage: "AI Studio package",
    primaryProvider: settings.scriptProvider,
    fallbackProvider: settings.scriptFallbackProvider,
    task: (provider) =>
      withRetry(() =>
        generateTextWithProvider(env, provider, settings.scriptModel, {
          prompt: buildAiStudioPackagePrompt({ ...promptBase, visualBrief })
        }).then(extractAiStudioPackage)
      )
  });

  const insertPayload = {
    session_id: sessionId,
    owner_user_id: context.user.id,
    owner_email: context.user.email,
    title: input.title,
    description: input.description,
    content_type: input.contentType,
    social_platform: input.socialPlatform,
    content_language: input.contentLanguage,
    tone: input.tone,
    cta_text: input.ctaText ?? null,
    reference_link: input.referenceLink ?? null,
    video_duration_sec: input.videoDurationSec,
    frame_count: input.frames.length,
    status: "completed",
    completed_at: nowIso(),
    visual_brief: visualBrief,
    scene_text: aiPackage.sceneText,
    sample_context_text: aiPackage.sampleContextText,
    script_text: aiPackage.scriptText,
    caption_text: aiPackage.captionText,
    hashtags: aiPackage.hashtags,
    charged_amount_idr: access.chargedAmountIdr,
    error_message: null,
    render_summary: {}
  };

  const insertResult = await context.serviceDb
    .from("generation_sessions")
    .insert(insertPayload)
    .select("*")
    .single<GenerationSessionRow>();
  if (insertResult.error || !insertResult.data) {
    throw insertResult.error || createHttpError(500, "Session generate tidak bisa disimpan.");
  }

  await completeAnalysisAccess(context, sessionId);
  return mapGenerationSession(insertResult.data);
  } catch (error) {
    await releaseAnalysisAccess(context, sessionId, access.accessType);
    throw error;
  }
}

async function getGenerationSessionForUser(
  context: AuthContext,
  sessionId: string
): Promise<GenerationSessionRow> {
  const baseQuery = context.serviceDb
    .from("generation_sessions")
    .select("*")
    .eq("session_id", sessionId);
  const query =
    context.user.role === "superadmin"
      ? baseQuery
      : baseQuery.eq("owner_user_id", context.user.id);
  const result = await query.maybeSingle<GenerationSessionRow>();
  if (result.error) {
    throw result.error;
  }
  if (!result.data) {
    throw createHttpError(404, "Session generate tidak ditemukan.");
  }
  return result.data;
}

async function listGenerationSessions(context: AuthContext): Promise<GenerationSessionRecord[]> {
  const baseQuery = context.serviceDb
    .from("generation_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const query =
    context.user.role === "superadmin"
      ? baseQuery
      : baseQuery.eq("owner_user_id", context.user.id);
  const result = await query;
  if (result.error) {
    throw result.error;
  }
  return (result.data || []).map((row) => mapGenerationSession(row as GenerationSessionRow));
}

function walletSummaryToApi(input: {
  user: AuthUser;
  walletBalanceIdr: number;
  recentLedger: WalletLedgerRow[];
  recentTopups: PaymentOrderRow[];
  generatePriceIdr: number;
}) {
  return {
    walletBalanceIdr: input.walletBalanceIdr,
    generatePriceIdr: input.generatePriceIdr,
    generateCreditsRemaining: input.user.isUnlimited
      ? null
      : Math.floor(input.walletBalanceIdr / input.generatePriceIdr),
    isUnlimited: input.user.isUnlimited,
    packages: DEPOSIT_PACKAGES.map((item) => ({
      ...item,
      generateCredits: Math.floor(item.creditAmountIdr / input.generatePriceIdr)
    })),
    recentLedger: input.recentLedger.map((entry) => ({
      id: entry.id,
      amountIdr: entry.amount_idr,
      balanceAfterIdr: entry.balance_after_idr,
      entryType: entry.entry_type,
      sourceType: entry.source_type,
      sourceId: entry.source_id,
      description: entry.description,
      metadata: entry.metadata ?? {},
      createdAt: entry.created_at
    })),
    recentTopups: input.recentTopups.map((entry) => ({
      id: entry.id,
      packageCode: entry.package_code,
      payAmountIdr: entry.pay_amount_idr,
      creditAmountIdr: entry.credit_amount_idr,
      taxRatePercent: normalizeTaxRatePercent(entry.tax_rate_percent),
      taxAmountIdr: Math.max(0, Math.trunc(entry.tax_amount_idr || 0)),
      netAmountIdr: Math.max(
        0,
        Math.trunc(entry.pay_amount_idr || 0) - Math.max(0, Math.trunc(entry.tax_amount_idr || 0))
      ),
      merchantOrderId: entry.merchant_order_id,
      webqrisInvoiceId: entry.webqris_invoice_id,
      qrisPayload: entry.qris_payload,
      uniqueCode: entry.unique_code,
      totalAmountIdr: entry.total_amount_idr,
      status: entry.status,
      expiredAt: entry.expired_at,
      paidAt: entry.paid_at,
      paymentMethod: entry.payment_method,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at
    }))
  };
}

async function getWallet(context: AuthContext, env: WorkerEnv) {
  const [{ data: profile }, { data: ledger }, { data: topups }] = await Promise.all([
    context.serviceDb
      .from("profiles")
      .select("wallet_balance_idr")
      .eq("id", context.user.id)
      .single<{ wallet_balance_idr: number }>(),
    context.serviceDb
      .from("wallet_ledger")
      .select("*")
      .eq("owner_user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    context.serviceDb
      .from("payment_orders")
      .select("*")
      .eq("owner_user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  return walletSummaryToApi({
    user: context.user,
    walletBalanceIdr: Math.max(0, Math.trunc(profile?.wallet_balance_idr ?? context.user.walletBalanceIdr)),
    recentLedger: (ledger || []) as WalletLedgerRow[],
    recentTopups: (topups || []) as PaymentOrderRow[],
    generatePriceIdr: getGeneratePriceIdr(env)
  });
}

function qrisEnvInteger(env: WorkerEnv, key: keyof WorkerEnv, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(String(env[key] || ""), 10);
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function resolveQrisPaymentWindow(env: WorkerEnv, at = new Date()) {
  const timeZone = String(env.INTERACTIVE_QRIS_TIME_ZONE || "Asia/Jakarta").trim() || "Asia/Jakarta";
  const openHour = qrisEnvInteger(env, "INTERACTIVE_QRIS_OPEN_HOUR", 5, 0, 23);
  const closeHour = qrisEnvInteger(env, "INTERACTIVE_QRIS_CLOSE_HOUR", 22, 1, 24);
  const wibDate = new Date(at.getTime() + WIB_OFFSET_MS);
  const currentHour = wibDate.getUTCHours();
  const isOpen = openHour < closeHour && currentHour >= openHour && currentHour < closeHour;
  let nextOpenAt: string | null = null;

  if (!isOpen) {
    const nextOpenWib = Date.UTC(
      wibDate.getUTCFullYear(),
      wibDate.getUTCMonth(),
      wibDate.getUTCDate() + (currentHour >= closeHour ? 1 : 0),
      openHour
    );
    nextOpenAt = new Date(nextOpenWib - WIB_OFFSET_MS).toISOString();
  }

  return {
    timeZone,
    opensAt: `${String(openHour).padStart(2, "0")}:00`,
    closesAt: `${String(closeHour).padStart(2, "0")}:00`,
    isOpen,
    nextOpenAt
  };
}

export function assertQrisPaymentWindowOpen(
  paymentWindow: ReturnType<typeof resolveQrisPaymentWindow>
): void {
  if (!paymentWindow.isOpen) {
    throw createHttpError(409, "Pembayaran QRIS sedang ditutup. Invoice baru tersedia kembali pukul 05.00 WIB.");
  }
}

function subscriptionConfig(settings: AppSettings, env: WorkerEnv, at = new Date()) {
  return {
    priceIdr: settings.subscriptionPriceIdr,
    subscriptionDays: settings.subscriptionDays,
    merchantName: settings.qrisMerchantName,
    qrisImageUrl: settings.qrisImageUrl,
    instructions: settings.qrisInstructions,
    uniqueDigits: 2 as const,
    uniqueCodeMin: qrisEnvInteger(env, "INTERACTIVE_QRIS_UNIQUE_CODE_MIN", 71, 1, 99),
    uniqueCodeMax: qrisEnvInteger(env, "INTERACTIVE_QRIS_UNIQUE_CODE_MAX", 99, 1, 99),
    paymentWindow: resolveQrisPaymentWindow(env, at),
    webhookConfigured: Boolean(
      String(env.INTERACTIVE_QRIS_WEBHOOK_SECRET || "").trim()
      && String(env.INTERACTIVE_QRIS_SOURCE_PACKAGE || "").trim()
    )
  };
}

function topupConfig(settings: AppSettings, env: WorkerEnv, at = new Date()) {
  return {
    merchantName: settings.qrisMerchantName,
    qrisImageUrl: settings.qrisImageUrl,
    instructions: settings.qrisInstructions,
    uniqueDigits: 2 as const,
    uniqueCodeMin: qrisEnvInteger(env, "INTERACTIVE_QRIS_UNIQUE_CODE_MIN", 71, 1, 99),
    uniqueCodeMax: qrisEnvInteger(env, "INTERACTIVE_QRIS_UNIQUE_CODE_MAX", 99, 1, 99),
    paymentWindow: resolveQrisPaymentWindow(env, at),
    webhookConfigured: Boolean(
      String(env.INTERACTIVE_QRIS_WEBHOOK_SECRET || "").trim()
      && String(env.INTERACTIVE_QRIS_SOURCE_PACKAGE || "").trim()
    )
  };
}

function mapSubscriptionOrder(row: SubscriptionOrderRow) {
  return {
    id: row.id,
    baseAmountIdr: Math.trunc(row.base_amount_idr),
    uniqueCode: String(Math.trunc(row.unique_code)).padStart(2, "0"),
    totalAmountIdr: Math.trunc(row.total_amount_idr),
    subscriptionDays: Math.trunc(row.subscription_days),
    status: row.status,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    subscriptionExpiresAt: row.subscription_expires_at
  };
}

async function getSubscriptionConfig(context: AuthContext, env: WorkerEnv) {
  return subscriptionConfig(await getSettings(context.serviceDb, env), env);
}

async function getTopupConfig(context: AuthContext, env: WorkerEnv) {
  return topupConfig(await getSettings(context.serviceDb, env), env);
}

async function createSubscriptionCheckout(context: AuthContext, env: WorkerEnv) {
  const settings = await getSettings(context.serviceDb, env);
  const config = subscriptionConfig(settings, env);
  if (!config.webhookConfigured) {
    throw createHttpError(503, "Webhook QRIS belum dikonfigurasi di Worker.");
  }
  if (!config.qrisImageUrl) {
    throw createHttpError(503, "Gambar QRIS statis belum diisi oleh admin.");
  }
  assertQrisPaymentWindowOpen(config.paymentWindow);
  if (config.uniqueCodeMin > config.uniqueCodeMax) {
    throw createHttpError(500, "Rentang kode unik QRIS tidak valid.");
  }
  const result = await context.serviceDb.rpc("create_subscription_order", {
    target_user_id: context.user.id,
    target_owner_email: context.user.email,
    target_base_amount_idr: settings.subscriptionPriceIdr,
    target_subscription_days: settings.subscriptionDays,
    target_unique_code_min: config.uniqueCodeMin,
    target_unique_code_max: config.uniqueCodeMax,
    target_expiry_minutes: qrisEnvInteger(env, "INTERACTIVE_QRIS_EXPIRY_MINUTES", 60, 5, 120)
  });
  if (result.error || !result.data) {
    throw result.error || createHttpError(500, "Invoice langganan tidak bisa dibuat.");
  }
  return { order: mapSubscriptionOrder(result.data as SubscriptionOrderRow), config };
}

async function getSubscriptionOrder(context: AuthContext, orderId: string) {
  const result = await context.serviceDb
    .from("subscription_orders")
    .select("*")
    .eq("id", orderId)
    .eq("owner_user_id", context.user.id)
    .maybeSingle<SubscriptionOrderRow>();
  if (result.error) throw result.error;
  if (!result.data) throw createHttpError(404, "Invoice langganan tidak ditemukan.");
  if (result.data.status === "pending" && new Date(result.data.expires_at).getTime() <= Date.now()) {
    const expired = await context.serviceDb
      .from("subscription_orders")
      .update({ status: "expired", updated_at: nowIso() })
      .eq("id", result.data.id)
      .select("*")
      .single<SubscriptionOrderRow>();
    if (expired.error || !expired.data) throw expired.error || createHttpError(500, "Status invoice tidak bisa diperbarui.");
    return mapSubscriptionOrder(expired.data);
  }
  return mapSubscriptionOrder(result.data);
}

async function recordQrisWebhookEvent(
  serviceDb: SupabaseClient,
  input: {
    payloadHash: string;
    packageName: string;
    amountCandidates: number[];
    processingStatus: "processed" | "ignored" | "failed";
    reason?: string;
    paymentOrderId?: string;
    subscriptionOrderId?: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const result = await serviceDb.from("qris_webhook_events").insert({
    payload_hash: input.payloadHash,
    package_name: input.packageName || null,
    amount_candidates: input.amountCandidates,
    processing_status: input.processingStatus,
    reason: input.reason || null,
    payment_order_id: input.paymentOrderId || null,
    subscription_order_id: input.subscriptionOrderId || null,
    raw_payload: input.payload
  });
  if (result.error && String(result.error.code || "") !== "23505") throw result.error;
}

async function handleInteractiveQrisWebhook(request: Request, env: WorkerEnv): Promise<Response> {
  const expectedSecret = String(env.INTERACTIVE_QRIS_WEBHOOK_SECRET || "").trim();
  const expectedPackage = String(env.INTERACTIVE_QRIS_SOURCE_PACKAGE || "").trim().toLowerCase();
  if (!expectedSecret || !expectedPackage) {
    throw createHttpError(503, "Webhook QRIS belum dikonfigurasi di Worker.");
  }
  const receivedSecret = String(request.headers.get("x-interactive-qris-secret") || "").trim();
  if (receivedSecret !== expectedSecret) throw createHttpError(401, "Secret QRIS tidak valid.");

  const body = await readQrisWebhookPayload(request);
  const packageName = String(body.packageName || "").trim().toLowerCase();
  const expectedPackageNormalized = normalizeQrisPackageText(expectedPackage);
  const packageNameNormalized = normalizeQrisPackageText(packageName);
  const packageAccepted =
    !packageNameNormalized
    || packageNameNormalized === expectedPackageNormalized
    || payloadLooksLikeInteractiveQris(body);
  const amountCandidates = extractQrisAmountCandidates(body);
  const payloadHash = await sha256Hex(JSON.stringify(body));
  const serviceDb = createServiceClient(env);
  const duplicate = await serviceDb
    .from("qris_webhook_events")
    .select("id,processing_status,reason")
    .eq("payload_hash", payloadHash)
    .maybeSingle<{ id: string; processing_status: string; reason: string | null }>();
  if (duplicate.error) throw duplicate.error;
  if (duplicate.data) {
    return jsonResponse({ received: true, credited: false, duplicate: true, reason: duplicate.data.reason || "already_processed" }, { headers: buildCorsHeaders(request) });
  }
  if (!packageAccepted) {
    await recordQrisWebhookEvent(serviceDb, { payloadHash, packageName, amountCandidates, processingStatus: "ignored", reason: "unexpected_package", payload: body });
    return jsonResponse({ received: true, credited: false, ignored: true, reason: "unexpected_package" }, { headers: buildCorsHeaders(request) });
  }
  if (!amountCandidates.length) {
    await recordQrisWebhookEvent(serviceDb, { payloadHash, packageName, amountCandidates, processingStatus: "ignored", reason: "amount_not_found", payload: body });
    return jsonResponse({ received: true, credited: false, ignored: true, reason: "amount_not_found" }, { headers: buildCorsHeaders(request) });
  }

  const expireResult = await serviceDb.from("payment_orders").update({ status: "expired", updated_at: nowIso() })
    .eq("provider", "interactive_qris").eq("status", "pending").lte("expired_at", nowIso());
  if (expireResult.error) throw expireResult.error;
  const pending = await serviceDb
    .from("payment_orders")
    .select("*")
    .eq("provider", "interactive_qris")
    .eq("status", "pending")
    .gt("expired_at", nowIso())
    .in("total_amount_idr", amountCandidates);
  if (pending.error) throw pending.error;
  const matches = (pending.data || []) as PaymentOrderRow[];
  if (matches.length !== 1) {
    const reason = matches.length > 1 ? "ambiguous_amount_match" : "payment_not_found";
    await recordQrisWebhookEvent(serviceDb, { payloadHash, packageName, amountCandidates, processingStatus: "ignored", reason, payload: body });
    return jsonResponse({ received: true, credited: false, ignored: true, reason, amountCandidates }, { headers: buildCorsHeaders(request) });
  }

  const matchedOrder = matches[0]!;
  const settled = await serviceDb.rpc("credit_wallet_from_payment", {
    order_id: matchedOrder.id,
    webhook_payload: {
      ...body,
      matchedAmountIdr: matchedOrder.total_amount_idr,
      data: {
        payment_method: "interactive_qris",
        paid_at: nowIso()
      }
    }
  });
  if (settled.error || !settled.data) throw settled.error || createHttpError(500, "Top up credit tidak bisa dikreditkan.");
  const order = settled.data as PaymentOrderRow;
  await recordQrisWebhookEvent(serviceDb, { payloadHash, packageName, amountCandidates, processingStatus: "processed", paymentOrderId: order.id, payload: body });
  return jsonResponse({
    received: true,
    credited: true,
    orderId: order.id,
    ownerEmail: order.owner_email,
    paidAmountIdr: order.total_amount_idr,
    creditAmountIdr: order.credit_amount_idr
  }, { headers: buildCorsHeaders(request) });
}

async function createTopup(context: AuthContext, env: WorkerEnv, packageCode: string) {
  const selectedPackage = getDepositPackage(packageCode);
  if (!selectedPackage) {
    throw createHttpError(400, "Paket deposit tidak tersedia.");
  }
  const settings = await getSettings(context.serviceDb, env);
  const config = topupConfig(settings, env);
  if (!config.webhookConfigured) {
    throw createHttpError(503, "Webhook QRIS belum dikonfigurasi di Worker.");
  }
  if (!config.qrisImageUrl) {
    throw createHttpError(503, "Gambar QRIS statis belum diisi oleh admin.");
  }
  assertQrisPaymentWindowOpen(config.paymentWindow);
  const taxRatePercent = normalizeTaxRatePercent(settings.taxRatePercent);
  const taxAmountIdr = calculateTaxAmountIdr(selectedPackage.payAmountIdr, taxRatePercent);

  const merchantOrderId = `VSQRIS-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const created = await context.serviceDb.rpc("create_static_qris_payment_order", {
    target_user_id: context.user.id,
    target_owner_email: context.user.email,
    target_package_code: selectedPackage.code,
    target_pay_amount_idr: selectedPackage.payAmountIdr,
    target_credit_amount_idr: selectedPackage.creditAmountIdr,
    target_tax_rate_percent: taxRatePercent,
    target_tax_amount_idr: taxAmountIdr,
    target_merchant_order_id: merchantOrderId,
    target_unique_code_min: config.uniqueCodeMin,
    target_unique_code_max: config.uniqueCodeMax,
    target_expiry_minutes: qrisEnvInteger(env, "INTERACTIVE_QRIS_EXPIRY_MINUTES", 60, 5, 120)
  });
  if (created.error || !created.data) {
    throw created.error || createHttpError(500, "Invoice top up QRIS tidak bisa dibuat.");
  }
  return walletSummaryToApiTopup(created.data as PaymentOrderRow);
}

function walletSummaryToApiTopup(entry: PaymentOrderRow) {
  const taxRatePercent = normalizeTaxRatePercent(entry.tax_rate_percent);
  const taxAmountIdr = Math.max(
    0,
    Math.trunc(
      entry.tax_amount_idr ??
        calculateTaxAmountIdr(Math.max(0, Math.trunc(entry.pay_amount_idr || 0)), taxRatePercent)
    )
  );
  return {
    id: entry.id,
    packageCode: entry.package_code,
    provider: entry.provider,
    payAmountIdr: entry.pay_amount_idr,
    creditAmountIdr: entry.credit_amount_idr,
    taxRatePercent,
    taxAmountIdr,
    netAmountIdr: Math.max(0, Math.trunc(entry.pay_amount_idr || 0) - taxAmountIdr),
    merchantOrderId: entry.merchant_order_id,
    webqrisInvoiceId: entry.webqris_invoice_id,
    qrisPayload: entry.qris_payload,
    uniqueCode: entry.unique_code,
    totalAmountIdr: entry.total_amount_idr,
    status: entry.status,
    expiredAt: entry.expired_at,
    paidAt: entry.paid_at,
    paymentMethod: entry.payment_method,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at
  };
}

async function maybeCreditTopupStatus(env: WorkerEnv, context: AuthContext, order: PaymentOrderRow) {
  if (order.provider === "interactive_qris") {
    return;
  }
  const apiToken = String(env.WEBQRIS_API_TOKEN || "").trim();
  if (!apiToken || order.status !== "pending" || !order.webqris_invoice_id) {
    return;
  }

  const webqrisBaseUrl = trimTrailingSlash(String(env.WEBQRIS_BASE_URL || "https://webqris.com"));
  const response = await fetch(
    `${webqrisBaseUrl}/api/payments/${encodeURIComponent(order.webqris_invoice_id)}/status`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    }
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const data =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : undefined;
  if (!response.ok || payload.success !== true || data?.status !== "paid") {
    return;
  }

  const rpcResult = await context.serviceDb.rpc("credit_wallet_from_payment", {
    order_id: order.id,
    webhook_payload: {
      event: "payment.paid",
      data
    }
  });
  if (rpcResult.error) {
    throw rpcResult.error;
  }
}

async function getTopupStatus(context: AuthContext, env: WorkerEnv, orderId: string) {
  const result = await context.serviceDb
    .from("payment_orders")
    .select("*")
    .eq("id", orderId)
    .eq("owner_user_id", context.user.id)
    .maybeSingle<PaymentOrderRow>();
  if (result.error) {
    throw result.error;
  }
  if (!result.data) {
    throw createHttpError(404, "Top up tidak ditemukan.");
  }

  if (result.data.status === "pending" && result.data.expired_at && new Date(result.data.expired_at).getTime() <= Date.now()) {
    const expired = await context.serviceDb
      .from("payment_orders")
      .update({ status: "expired", updated_at: nowIso() })
      .eq("id", result.data.id)
      .select("*")
      .single<PaymentOrderRow>();
    if (expired.error || !expired.data) {
      throw expired.error || createHttpError(500, "Status top up tidak bisa diperbarui.");
    }
    return walletSummaryToApiTopup(expired.data);
  }

  await maybeCreditTopupStatus(env, context, result.data);

  const refreshed = await context.serviceDb
    .from("payment_orders")
    .select("*")
    .eq("id", orderId)
    .single<PaymentOrderRow>();
  if (refreshed.error || !refreshed.data) {
    throw refreshed.error || createHttpError(500, "Status top up tidak bisa dimuat.");
  }
  return walletSummaryToApiTopup(refreshed.data);
}

function encodeAdminTransactionCursor(cursor: { occurredAt: string; transactionId: string } | null): string | null {
  if (!cursor) {
    return null;
  }
  return btoa(JSON.stringify(cursor));
}

function decodeAdminTransactionCursor(cursor: string | null): { occurredAt: string; transactionId: string } | null {
  const raw = String(cursor || "").trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(atob(raw)) as {
      occurredAt?: unknown;
      transactionId?: unknown;
    };
    const occurredAt = String(parsed.occurredAt || "").trim();
    const transactionId = String(parsed.transactionId || "").trim();
    if (!occurredAt || !transactionId) {
      throw new Error("invalid");
    }
    return { occurredAt, transactionId };
  } catch {
    throw createHttpError(400, "Cursor transaksi tidak valid.");
  }
}

function parseAdminTransactionLimit(value: string | null): number {
  const numeric = Number(value || "");
  if (!Number.isFinite(numeric)) {
    return 50;
  }
  return Math.max(1, Math.min(100, Math.trunc(numeric)));
}

function mapAdminTransactionRow(row: AdminTransactionFeedRow): AdminTransactionRecord {
  return {
    transactionId: row.transaction_id,
    kind: row.kind,
    status: row.status,
    occurredAt: row.occurred_at,
    ownerUserId: row.owner_user_id,
    ownerEmail: row.owner_email,
    grossAmountIdr: Math.max(0, Math.trunc(row.gross_amount_idr || 0)),
    walletImpactIdr: Math.trunc(row.wallet_impact_idr || 0),
    balanceAfterIdr:
      row.balance_after_idr === null || row.balance_after_idr === undefined
        ? null
        : Math.trunc(row.balance_after_idr),
    taxRatePercent: normalizeTaxRatePercent(row.tax_rate_percent),
    taxAmountIdr: Math.max(0, Math.trunc(row.tax_amount_idr || 0)),
    netAmountIdr: Math.max(0, Math.trunc(row.net_amount_idr || 0)),
    entryType: row.entry_type,
    sourceType: row.source_type,
    description: row.description || "-",
    paymentMethod: row.payment_method,
    merchantOrderId: row.merchant_order_id,
    invoiceId: row.invoice_id
  };
}

async function getAdminTransactions(context: AuthContext, limit: number, cursor: string | null) {
  requireSuperadmin(context);
  const decodedCursor = decodeAdminTransactionCursor(cursor);
  const rpcResult = await context.serviceDb.rpc("admin_transaction_feed", {
    row_limit: limit + 1,
    cursor_occurred_at: decodedCursor?.occurredAt ?? null,
    cursor_transaction_id: decodedCursor?.transactionId ?? null
  });
  if (rpcResult.error) {
    throw rpcResult.error;
  }
  const rows = ((rpcResult.data || []) as AdminTransactionFeedRow[]).map(mapAdminTransactionRow);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = hasMore ? items[items.length - 1] : null;
  return {
    items,
    nextCursor: encodeAdminTransactionCursor(
      last
        ? {
            occurredAt: last.occurredAt,
            transactionId: last.transactionId
          }
        : null
    )
  };
}

async function listAdminUsers(context: AuthContext, env: WorkerEnv) {
  requireSuperadmin(context);
  const result = await context.serviceDb
    .from("profiles")
    .select("*")
    .order("email", { ascending: true });
  if (result.error) {
    throw result.error;
  }
  return (result.data || []).map((row) =>
    mapProfileToAdminUser(row as ProfileRow, getGeneratePriceIdr(env))
  );
}

async function createAdminUser(context: AuthContext, env: WorkerEnv, input: Record<string, unknown>) {
  requireSuperadmin(context);
  const email = String(assertString(input.email, "Email", { max: 160 }) || "").toLowerCase();
  const password = assertString(input.password, "Password", { max: 100 }) || "";
  if (password.length < 8) {
    throw createHttpError(400, "Password minimal 8 karakter.");
  }

  const existing = await context.serviceDb
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    throw createHttpError(409, "Email sudah terdaftar.");
  }

  const adminResult = await createServiceClient(env).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: assertString(input.displayName, "Nama", { required: false, max: 80 }) || email.split("@")[0]
    }
  });
  if (adminResult.error || !adminResult.data.user?.id) {
    throw adminResult.error || createHttpError(500, "User baru tidak dapat dibuat.");
  }

  const updated = await context.serviceDb
    .from("profiles")
    .update({
      display_name:
        assertString(input.displayName, "Nama", { required: false, max: 80 }) || email.split("@")[0],
      role: String(input.role || "user") === "superadmin" ? "superadmin" : "user",
      subscription_status:
        String(input.subscriptionStatus || "active") === "inactive" ? "inactive" : "active",
      is_unlimited: Boolean(input.isUnlimited),
      has_password: true,
      updated_at: nowIso()
    })
    .eq("id", adminResult.data.user.id)
    .select("*")
    .single<ProfileRow>();
  if (updated.error || !updated.data) {
    throw updated.error || createHttpError(500, "Profil user baru tidak bisa disiapkan.");
  }

  return mapProfileToAdminUser(updated.data, getGeneratePriceIdr(env));
}

async function updateAdminUser(context: AuthContext, env: WorkerEnv, userEmail: string, input: Record<string, unknown>) {
  requireSuperadmin(context);
  const normalizedEmail = userEmail.trim().toLowerCase();
  const current = await context.serviceDb
    .from("profiles")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle<ProfileRow>();
  if (current.error) {
    throw current.error;
  }
  if (!current.data) {
    throw createHttpError(404, "User tidak ditemukan.");
  }

  const updated = await context.serviceDb
    .from("profiles")
    .update({
      display_name:
        assertString(input.displayName, "Nama", { required: false, max: 80 }) || current.data.display_name,
      role: String(input.role || current.data.role) === "superadmin" ? "superadmin" : "user",
      subscription_status:
        String(input.subscriptionStatus || current.data.subscription_status) === "inactive"
          ? "inactive"
          : "active",
      is_unlimited:
        input.isUnlimited === undefined ? current.data.is_unlimited : Boolean(input.isUnlimited),
      disabled_at:
        input.disabled === true
          ? nowIso()
          : input.disabled === false
            ? null
            : current.data.disabled_at,
      disabled_reason:
        input.disabled === true
          ? assertString(input.disabledReason, "Alasan nonaktif", {
              required: false,
              max: 240
            }) || "Dinonaktifkan oleh admin"
          : input.disabled === false
            ? null
            : current.data.disabled_reason,
      assigned_package_code:
        input.assignedPackageCode === undefined
          ? current.data.assigned_package_code
          : (input.assignedPackageCode as AssignedPackageCode | null),
      video_quota_total:
        input.videoQuotaTotal === undefined
          ? current.data.video_quota_total
          : Math.max(0, Math.trunc(Number(input.videoQuotaTotal) || 0)),
      video_quota_used:
        input.videoQuotaUsed === undefined
          ? current.data.video_quota_used
          : Math.max(0, Math.trunc(Number(input.videoQuotaUsed) || 0)),
      updated_at: nowIso()
    })
    .eq("email", normalizedEmail)
    .select("*")
    .single<ProfileRow>();
  if (updated.error || !updated.data) {
    throw updated.error || createHttpError(500, "User tidak bisa diperbarui.");
  }
  return mapProfileToAdminUser(updated.data, getGeneratePriceIdr(env));
}

async function disableAdminUser(context: AuthContext, env: WorkerEnv, userEmail: string) {
  if (userEmail.trim().toLowerCase() === SUPERADMIN_WHITELIST_EMAIL) {
    throw createHttpError(400, "User whitelist utama tidak bisa dinonaktifkan.");
  }
  return await updateAdminUser(context, env, userEmail, {
    subscriptionStatus: "inactive",
    disabled: true,
    disabledReason: "Dinonaktifkan oleh admin"
  });
}

async function grantAdminPackage(
  context: AuthContext,
  env: WorkerEnv,
  userEmail: string,
  input: Record<string, unknown>
) {
  requireSuperadmin(context);
  const packageCode = String(input.packageCode || "").trim() as AssignedPackageCode;
  if (!["10_video", "50_video", "100_video", "custom"].includes(packageCode)) {
    throw createHttpError(400, "Kode paket tidak valid.");
  }
  const packageInfo = packageCode === "custom" ? undefined : getDepositPackage(packageCode);
  const amountIdr =
    packageCode === "custom"
      ? Math.max(1000, Math.trunc(Number(input.customAmountIdr) || 0))
      : packageInfo?.creditAmountIdr ?? 0;
  const description =
    assertString(input.description, "Catatan paket", { required: false, max: 240 }) ||
    (packageInfo
      ? `Assign paket ${packageInfo.label} oleh admin`
      : "Penyesuaian saldo custom oleh admin");

  const target = await context.serviceDb
    .from("profiles")
    .select("id")
    .eq("email", userEmail.trim().toLowerCase())
    .maybeSingle<{ id: string }>();
  if (target.error) {
    throw target.error;
  }
  if (!target.data) {
    throw createHttpError(404, "User tidak ditemukan.");
  }

  const rpcResult = await context.serviceDb.rpc("admin_grant_wallet_credit", {
    target_user_id: target.data.id,
    grant_amount_idr: amountIdr,
    package_code: packageCode,
    actor_email: context.user.email,
    description
  });
  if (rpcResult.error) {
    throw rpcResult.error;
  }
  return mapProfileToAdminUser(rpcResult.data as ProfileRow, getGeneratePriceIdr(env));
}

function routesFor(url: URL): { path: string; parts: string[] } {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return {
    path,
    parts: path.split("/").filter(Boolean)
  };
}

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request)
    });
  }

  const url = new URL(request.url);
  const route = routesFor(url);

  try {
    if (route.path === "/api/health" && request.method === "GET") {
      return jsonResponse(
        {
          status: "ok",
          now: nowIso()
        },
        { headers: buildCorsHeaders(request) }
      );
    }

    if (route.path === "/api/auth/session" && request.method === "GET") {
      try {
        const context = await requireAuth(request, env);
        return jsonResponse({ user: context.user }, { headers: buildCorsHeaders(request) });
      } catch {
        return jsonResponse({ user: null }, { headers: buildCorsHeaders(request) });
      }
    }

    if (route.path === "/api/webhooks/interactive-qris" && request.method === "POST") {
      return await handleInteractiveQrisWebhook(request, env);
    }

    const context = await requireAuth(request, env);

    if (route.path === "/api/billing/subscription/config" && request.method === "GET") {
      return jsonResponse(await getSubscriptionConfig(context, env), { headers: buildCorsHeaders(request) });
    }

    if (route.path === "/api/billing/topups/config" && request.method === "GET") {
      return jsonResponse(await getTopupConfig(context, env), { headers: buildCorsHeaders(request) });
    }

    if (route.path === "/api/billing/subscription/orders" && request.method === "POST") {
      return jsonResponse(await createSubscriptionCheckout(context, env), { status: 201, headers: buildCorsHeaders(request) });
    }

    if (route.parts[0] === "api" && route.parts[1] === "billing" && route.parts[2] === "subscription" && route.parts[3] === "orders" && route.parts[5] === "status" && request.method === "GET") {
      return jsonResponse(await getSubscriptionOrder(context, route.parts[4] || ""), { headers: buildCorsHeaders(request) });
    }

    if (route.path === "/api/billing/wallet" && request.method === "GET") {
      return jsonResponse(await getWallet(context, env), { headers: buildCorsHeaders(request) });
    }

    if (route.path === "/api/billing/topups" && request.method === "POST") {
      const payload = (await parseJsonRequest(request)) as Record<string, unknown>;
      return jsonResponse(await createTopup(context, env, String(payload.packageCode || "")), {
        status: 201,
        headers: buildCorsHeaders(request)
      });
    }

    if (route.parts[0] === "api" && route.parts[1] === "billing" && route.parts[2] === "topups" && route.parts[4] === "status" && request.method === "GET") {
      return jsonResponse(await getTopupStatus(context, env, route.parts[3] || ""), {
        headers: buildCorsHeaders(request)
      });
    }

    if (route.path === "/api/admin/users" && request.method === "GET") {
      return jsonResponse(await listAdminUsers(context, env), { headers: buildCorsHeaders(request) });
    }

    if (route.path === "/api/admin/transactions" && request.method === "GET") {
      const limit = parseAdminTransactionLimit(url.searchParams.get("limit"));
      const cursor = url.searchParams.get("cursor");
      return jsonResponse(await getAdminTransactions(context, limit, cursor), {
        headers: buildCorsHeaders(request)
      });
    }

    if (route.path === "/api/admin/users" && request.method === "POST") {
      const payload = (await parseJsonRequest(request)) as Record<string, unknown>;
      return jsonResponse(await createAdminUser(context, env, payload), {
        status: 201,
        headers: buildCorsHeaders(request)
      });
    }

    if (route.parts[0] === "api" && route.parts[1] === "admin" && route.parts[2] === "users" && route.parts.length === 4 && request.method === "PATCH") {
      const payload = (await parseJsonRequest(request)) as Record<string, unknown>;
      return jsonResponse(
        await updateAdminUser(context, env, decodeURIComponent(route.parts[3] || ""), payload),
        {
          headers: buildCorsHeaders(request)
        }
      );
    }

    if (route.parts[0] === "api" && route.parts[1] === "admin" && route.parts[2] === "users" && route.parts.length === 4 && request.method === "DELETE") {
      return jsonResponse(
        await disableAdminUser(context, env, decodeURIComponent(route.parts[3] || "")),
        {
          headers: buildCorsHeaders(request)
        }
      );
    }

    if (route.parts[0] === "api" && route.parts[1] === "admin" && route.parts[2] === "users" && route.parts[4] === "package-grants" && request.method === "POST") {
      const payload = (await parseJsonRequest(request)) as Record<string, unknown>;
      return jsonResponse(
        await grantAdminPackage(context, env, decodeURIComponent(route.parts[3] || ""), payload),
        {
          status: 201,
          headers: buildCorsHeaders(request)
        }
      );
    }

    if (route.path === "/api/settings" && request.method === "GET") {
      requireSuperadmin(context);
      return jsonResponse(await getSettings(context.serviceDb, env), {
        headers: buildCorsHeaders(request)
      });
    }

    if (route.path === "/api/settings" && request.method === "PUT") {
      requireSuperadmin(context);
      const nextSettings = parseSettingsInput(await parseJsonRequest(request));
      const result = await context.serviceDb
        .from("app_settings")
        .upsert({
          settings_key: "default",
          script_provider: nextSettings.scriptProvider,
          script_fallback_provider: nextSettings.scriptFallbackProvider,
          script_model: nextSettings.scriptModel,
          tax_rate_percent: nextSettings.taxRatePercent,
          language: nextSettings.language,
          max_video_seconds: nextSettings.maxVideoSeconds,
          safety_mode: nextSettings.safetyMode,
          concurrency: nextSettings.concurrency,
          subscription_price_idr: nextSettings.subscriptionPriceIdr,
          subscription_days: nextSettings.subscriptionDays,
          qris_merchant_name: nextSettings.qrisMerchantName,
          qris_image_url: nextSettings.qrisImageUrl,
          qris_instructions: nextSettings.qrisInstructions
        }, { onConflict: "settings_key" });
      if (result.error) {
        throw result.error;
      }
      return jsonResponse(applyRuntimeSettingsEnvOverrides(nextSettings, env), {
        headers: buildCorsHeaders(request)
      });
    }

    if (route.path === "/api/generation-sessions" && request.method === "GET") {
      return jsonResponse(await listGenerationSessions(context), { headers: buildCorsHeaders(request) });
    }

    if (route.path === "/api/generation-sessions" && request.method === "POST") {
      const payload = parseGenerationSessionCreateInput(await parseJsonRequest(request));
      return jsonResponse(
        {
          session: await createGenerationSession(env, context, payload)
        },
        {
          status: 201,
          headers: buildCorsHeaders(request)
        }
      );
    }

    if (route.parts[0] === "api" && route.parts[1] === "generation-sessions" && route.parts.length === 3 && request.method === "GET") {
      const session = await getGenerationSessionForUser(context, route.parts[2] || "");
      return jsonResponse({ session: mapGenerationSession(session) }, { headers: buildCorsHeaders(request) });
    }

    throw createHttpError(404, "Route API tidak ditemukan.");
  } catch (error) {
    return errorResponse(request, error, "Terjadi kesalahan pada sistem.");
  }
}
