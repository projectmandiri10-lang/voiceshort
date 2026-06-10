import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ABSOLUTE_MAX_VIDEO_SECONDS, DEFAULT_SETTINGS, GEMINI_EXCITED_PRESETS, GEMINI_TTS_VOICES, findGenderVoiceSetting, findTtsVoiceByName, isKnownTtsVoiceName, normalizeTtsModel } from "./shared/constants";
import { buildCaptionPrompt, buildScriptPrompt, buildVisualBriefPrompt } from "./shared/prompt-builder";
import { extractScriptText, extractSocialMetadata, extractVisualBrief } from "./shared/model-output";
import { CONTENT_TYPES, type AdminUserRecord, type AppSettings, type AssignedPackageCode, type AuthUser, type ContentType, type GenerationSessionCompleteInput, type GenerationSessionCreateInput, type GenerationSessionRecord, type GenerationSessionStatus, type JobVoiceGender, type TtsVoiceOption, type UserRole } from "./types";

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
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  WEBQRIS_BASE_URL?: string;
  WEBQRIS_API_TOKEN?: string;
  WEBQRIS_WEBHOOK_SECRET?: string;
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
}

interface AppSettingsRow {
  settings_key: "default";
  script_model: string;
  tts_model: string;
  language: "id-ID";
  max_video_seconds: number;
  safety_mode: "safe_marketing";
  concurrency: 1;
  gender_voices: AppSettings["genderVoices"];
}

interface GenerationSessionRow {
  session_id: string;
  owner_user_id: string;
  owner_email: string;
  title: string;
  description: string;
  content_type: ContentType;
  voice_gender: JobVoiceGender;
  tone: string;
  cta_text: string | null;
  reference_link: string | null;
  video_duration_sec: number;
  frame_count: number;
  status: GenerationSessionStatus;
  script_text: string | null;
  caption_text: string | null;
  hashtags: string[] | null;
  voice_name: string | null;
  speech_rate: number | null;
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
  merchant_order_id: string;
  webqris_invoice_id: string | null;
  qris_payload: string | null;
  unique_code: number | null;
  total_amount_idr: number | null;
  status: "pending" | "paid" | "expired" | "failed" | "canceled";
  expired_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
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

interface GeminiAudio {
  bytes: Uint8Array;
  mimeType: string;
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
    "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-signature, x-signature",
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

function getGeneratePriceIdr(env: WorkerEnv): number {
  const raw = String(env.GENERATE_PRICE_IDR || "").trim();
  const parsed = raw ? Number(raw) : DEFAULT_GENERATE_PRICE_IDR;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_GENERATE_PRICE_IDR;
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
  const generateCreditsRemaining = unlimited
    ? null
    : Math.floor(Math.max(0, Math.trunc(profile.wallet_balance_idr || 0)) / generatePriceIdr);
  return {
    id: profile.id,
    email,
    displayName: profile.display_name.trim() || email.split("@")[0] || email,
    role: isWhitelistedSuperadmin(email) || profile.role === "superadmin" ? "superadmin" : "user",
    subscriptionStatus:
      isWhitelistedSuperadmin(email) || profile.subscription_status === "active"
        ? "active"
        : "inactive",
    videoQuotaTotal: Math.max(0, Math.trunc(profile.video_quota_total || 0)),
    videoQuotaUsed: Math.max(0, Math.trunc(profile.video_quota_used || 0)),
    videoQuotaRemaining: generateCreditsRemaining,
    walletBalanceIdr: Math.max(0, Math.trunc(profile.wallet_balance_idr || 0)),
    generatePriceIdr,
    generateCreditsRemaining,
    isUnlimited: unlimited,
    disabledAt: unlimited && isWhitelistedSuperadmin(email) ? null : profile.disabled_at,
    disabledReason: unlimited && isWhitelistedSuperadmin(email) ? null : profile.disabled_reason,
    assignedPackageCode: profile.assigned_package_code ?? null
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
        scriptModel: row.script_model,
        ttsModel: normalizeTtsModel(row.tts_model),
        language: row.language,
        maxVideoSeconds: row.max_video_seconds,
        safetyMode: row.safety_mode,
        concurrency: row.concurrency,
        genderVoices: Array.isArray(row.gender_voices) ? row.gender_voices : DEFAULT_SETTINGS.genderVoices
      }
    : DEFAULT_SETTINGS;

  return {
    scriptModel: String(source.scriptModel || DEFAULT_SETTINGS.scriptModel).trim() || DEFAULT_SETTINGS.scriptModel,
    ttsModel:
      normalizeTtsModel(String(source.ttsModel || DEFAULT_SETTINGS.ttsModel).trim()) ||
      DEFAULT_SETTINGS.ttsModel,
    language: "id-ID",
    maxVideoSeconds: Math.max(10, Math.min(ABSOLUTE_MAX_VIDEO_SECONDS, Math.trunc(source.maxVideoSeconds || DEFAULT_SETTINGS.maxVideoSeconds))),
    safetyMode: "safe_marketing",
    concurrency: 1,
    genderVoices: DEFAULT_SETTINGS.genderVoices.map((fallbackVoice) => {
      const selected = Array.isArray(source.genderVoices)
        ? source.genderVoices.find((voice) => voice.gender === fallbackVoice.gender)
        : undefined;
      const voiceName =
        selected?.voiceName && isKnownTtsVoiceName(selected.voiceName)
          ? selected.voiceName
          : fallbackVoice.voiceName;
      const speechRate = Number(selected?.speechRate);
      return {
        gender: fallbackVoice.gender,
        voiceName,
        speechRate:
          Number.isFinite(speechRate) && speechRate >= 0.7 && speechRate <= 1.3
            ? speechRate
            : fallbackVoice.speechRate
      };
    })
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
    voiceGender: row.voice_gender,
    tone: row.tone,
    ctaText: row.cta_text || undefined,
    referenceLink: row.reference_link || undefined,
    videoDurationSec: row.video_duration_sec,
    frameCount: row.frame_count,
    status: row.status,
    scriptText: row.script_text || undefined,
    captionText: row.caption_text || undefined,
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    voiceName: row.voice_name || undefined,
    speechRate: row.speech_rate ?? undefined,
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

function assertVoiceGender(value: unknown): JobVoiceGender {
  const voiceGender = String(value ?? "").trim() as JobVoiceGender;
  if (voiceGender !== "male" && voiceGender !== "female") {
    throw createHttpError(400, "Gender suara tidak valid.");
  }
  return voiceGender;
}

function assertSpeechRate(value: unknown): number {
  const speechRate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(speechRate) || speechRate < 0.7 || speechRate > 1.3) {
    throw createHttpError(400, "Speech rate harus berada di rentang 0.7 sampai 1.3.");
  }
  return speechRate;
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
  const genderVoices = Array.isArray(body.genderVoices) ? body.genderVoices : [];
  const normalizedGenderVoices = DEFAULT_SETTINGS.genderVoices.map((fallbackVoice) => {
    const selected = genderVoices.find((voice) => {
      return (
        voice &&
        typeof voice === "object" &&
        !Array.isArray(voice) &&
        String((voice as Record<string, unknown>).gender || "") === fallbackVoice.gender
      );
    }) as Record<string, unknown> | undefined;

    const voiceName = String(selected?.voiceName || fallbackVoice.voiceName).trim();
    if (!isKnownTtsVoiceName(voiceName)) {
      throw createHttpError(400, `Voice default untuk ${fallbackVoice.gender} tidak tersedia.`);
    }
    return {
      gender: fallbackVoice.gender,
      voiceName,
      speechRate: assertSpeechRate(selected?.speechRate ?? fallbackVoice.speechRate)
    };
  });

  return {
    scriptModel: assertString(body.scriptModel, "Script model") || DEFAULT_SETTINGS.scriptModel,
    ttsModel: normalizeTtsModel(assertString(body.ttsModel, "TTS model") || DEFAULT_SETTINGS.ttsModel),
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
    genderVoices: normalizedGenderVoices
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
  if (!frames.length) {
    throw createHttpError(400, "Cuplikan video wajib dikirim untuk analisis.");
  }
  if (frames.length > 24) {
    throw createHttpError(400, "Jumlah cuplikan melebihi batas aman.");
  }

  return {
    title: assertString(body.title, "Judul", { max: 160 }) || "",
    description: assertString(body.description, "Brief / deskripsi", { max: 3000 }) || "",
    contentType: assertContentType(body.contentType),
    voiceGender: assertVoiceGender(body.voiceGender),
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

function parseGenerationSessionCompleteInput(input: unknown): GenerationSessionCompleteInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createHttpError(400, "Payload penyelesaian render tidak valid.");
  }
  const body = input as Record<string, unknown>;
  const finalDurationSec = Number(body.finalDurationSec);
  const finalSizeBytes = Number(body.finalSizeBytes);
  if (!Number.isFinite(finalDurationSec) || finalDurationSec <= 0) {
    throw createHttpError(400, "Durasi final video tidak valid.");
  }
  if (!Number.isFinite(finalSizeBytes) || finalSizeBytes <= 0) {
    throw createHttpError(400, "Ukuran file final tidak valid.");
  }
  return {
    finalDurationSec,
    finalSizeBytes,
    localFileName: assertString(body.localFileName, "Nama file final", { required: false, max: 255 })
  };
}

async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw createHttpError(400, "Body JSON tidak valid.");
  }
}

async function getSettings(serviceDb: SupabaseClient): Promise<AppSettings> {
  const result = await serviceDb
    .from("app_settings")
    .select("*")
    .eq("settings_key", "default")
    .maybeSingle<AppSettingsRow>();
  if (result.error) {
    throw result.error;
  }
  return normalizeSettings(result.data);
}

async function callGemini(
  env: WorkerEnv,
  model: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${trimTrailingSlash("https://generativelanguage.googleapis.com")}/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getRequiredEnv(env, "GEMINI_API_KEY")
      },
      body: JSON.stringify(body)
    }
  );

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof (payload.error as { message?: unknown } | undefined)?.message === "string"
        ? String((payload.error as { message?: unknown }).message)
        : `Gemini request gagal (${response.status}).`;
    throw createHttpError(response.status === 429 ? 503 : response.status, message, payload);
  }
  return payload;
}

const OPENROUTER_TTS_URL = "https://openrouter.ai/api/v1/audio/speech";

async function callOpenRouterTts(
  env: WorkerEnv,
  body: Record<string, unknown>
): Promise<Response> {
  const response = await fetch(OPENROUTER_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRequiredEnv(env, "OPENROUTER_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { message: text };
      }
    }
    const message =
      typeof (payload.error as { message?: unknown } | undefined)?.message === "string"
        ? String((payload.error as { message?: unknown }).message)
        : typeof payload.message === "string"
          ? payload.message
          : `OpenRouter TTS request gagal (${response.status}).`;
    throw createHttpError(response.status === 429 ? 503 : response.status, message, payload);
  }

  return response;
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

function buildGeminiFrameParts(
  frames: GenerationSessionCreateInput["frames"]
): Array<Record<string, unknown>> {
  return frames.map((frame) => ({
    inlineData: {
      mimeType: frame.mimeType,
      data: frame.base64Data
    }
  }));
}

async function generateOpenRouterAudio(
  env: WorkerEnv,
  settings: AppSettings,
  input: {
    text: string;
    voiceName: string;
    speechRate: number;
    deliveryHint?: string;
  }
): Promise<GeminiAudio> {
  const response = await withRetry(() =>
    callOpenRouterTts(env, {
      model: settings.ttsModel,
      input: input.text.replace(/\s+/g, " ").trim(),
      voice: input.voiceName,
      response_format: "mp3",
      speed: input.speechRate
    })
  );
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get("Content-Type")?.trim() || "audio/mpeg"
  };
}

async function createGenerationSession(
  env: WorkerEnv,
  context: AuthContext,
  input: GenerationSessionCreateInput
): Promise<GenerationSessionRecord> {
  const settings = await getSettings(context.serviceDb);
  if (input.videoDurationSec > settings.maxVideoSeconds) {
    throw createHttpError(
      400,
      `Durasi video ${input.videoDurationSec.toFixed(2)} detik melebihi batas ${settings.maxVideoSeconds} detik.`
    );
  }

  const voiceProfile = findGenderVoiceSetting(settings, input.voiceGender);
  if (!voiceProfile) {
    throw createHttpError(500, `Default voice untuk ${input.voiceGender} belum dikonfigurasi.`);
  }

  const promptBase = {
    settings,
    title: input.title,
    description: input.description,
    contentType: input.contentType,
    voiceGender: input.voiceGender,
    tone: input.tone,
    videoDurationSec: input.videoDurationSec,
    frameCount: input.frames.length,
    ctaText: input.ctaText,
    referenceLink: input.referenceLink
  } as const;

  const frameParts = buildGeminiFrameParts(input.frames);
  const visualBriefPrompt = buildVisualBriefPrompt(promptBase);
  const visualBriefResponse = await withRetry(() =>
    callGemini(env, settings.scriptModel, {
      contents: [
        {
          role: "user",
          parts: [...frameParts, { text: visualBriefPrompt }]
        }
      ]
    })
  );
  const visualBrief = extractVisualBrief(visualBriefResponse);

  const scriptResponse = await withRetry(() =>
    callGemini(env, settings.scriptModel, {
      contents: [
        {
          role: "user",
          parts: [{ text: buildScriptPrompt({ ...promptBase, visualBrief }) }]
        }
      ]
    })
  );
  const scriptText = extractScriptText(scriptResponse);
  if (!scriptText) {
    throw createHttpError(502, "Gemini mengembalikan naskah kosong.");
  }

  const captionResponse = await withRetry(() =>
    callGemini(env, settings.scriptModel, {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildCaptionPrompt({
                ...promptBase,
                visualBrief,
                scriptText
              })
            }
          ]
        }
      ]
    })
  );
  const social = extractSocialMetadata(captionResponse);

  const sessionId = crypto.randomUUID();
  const chargeAmountIdr = getGeneratePriceIdr(env);
  const reserveResult = await context.serviceDb.rpc("reserve_generate_credit", {
    job_id: sessionId,
    target_user_id: context.user.id,
    charge_amount_idr: chargeAmountIdr,
    billed_minutes: 1,
    video_duration_sec: input.videoDurationSec
  });
  if (reserveResult.error) {
    throw createHttpError(402, reserveResult.error.message);
  }

  const insertPayload = {
    session_id: sessionId,
    owner_user_id: context.user.id,
    owner_email: context.user.email,
    title: input.title,
    description: input.description,
    content_type: input.contentType,
    voice_gender: input.voiceGender,
    tone: input.tone,
    cta_text: input.ctaText ?? null,
    reference_link: input.referenceLink ?? null,
    video_duration_sec: input.videoDurationSec,
    frame_count: input.frames.length,
    status: "ready_for_audio",
    script_text: scriptText,
    caption_text: social.caption,
    hashtags: social.hashtags,
    voice_name: voiceProfile.voiceName,
    speech_rate: voiceProfile.speechRate,
    charged_amount_idr: chargeAmountIdr,
    error_message: null,
    render_summary: {}
  };

  const insertResult = await context.serviceDb
    .from("generation_sessions")
    .insert(insertPayload)
    .select("*")
    .single<GenerationSessionRow>();
  if (insertResult.error || !insertResult.data) {
    await context.serviceDb.rpc("refund_generate_credit", {
      job_id: sessionId,
      target_user_id: context.user.id,
      reason: "Rollback session insert failure"
    });
    throw insertResult.error || createHttpError(500, "Session generate tidak bisa disimpan.");
  }

  return mapGenerationSession(insertResult.data);
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

async function markGenerationSessionComplete(
  context: AuthContext,
  sessionId: string,
  input: GenerationSessionCompleteInput
): Promise<GenerationSessionRecord> {
  await getGenerationSessionForUser(context, sessionId);
  const result = await context.serviceDb
    .from("generation_sessions")
    .update({
      status: "completed",
      completed_at: nowIso(),
      error_message: null,
      render_summary: {
        finalDurationSec: Number(input.finalDurationSec.toFixed(2)),
        finalSizeBytes: Math.trunc(input.finalSizeBytes),
        localFileName: input.localFileName ?? null,
        renderedAt: nowIso()
      }
    })
    .eq("session_id", sessionId)
    .select("*")
    .single<GenerationSessionRow>();
  if (result.error || !result.data) {
    throw result.error || createHttpError(500, "Gagal menyimpan hasil render lokal.");
  }
  return mapGenerationSession(result.data);
}

async function markGenerationSessionFailed(
  context: AuthContext,
  sessionId: string,
  input: { reason?: string; retryable?: boolean }
): Promise<GenerationSessionRecord> {
  const current = await getGenerationSessionForUser(context, sessionId);
  const reason = assertString(input.reason, "Alasan gagal", { required: false, max: 500 });
  const nextStatus: GenerationSessionStatus = input.retryable === false ? "failed" : "ready_for_render";
  const result = await context.serviceDb
    .from("generation_sessions")
    .update({
      status: nextStatus,
      error_message: nextStatus === "failed" ? reason ?? "Render lokal gagal." : null,
      render_summary: {
        ...(current.render_summary || {}),
        lastClientError: reason ?? "Render lokal gagal."
      }
    })
    .eq("session_id", sessionId)
    .select("*")
    .single<GenerationSessionRow>();
  if (result.error || !result.data) {
    throw result.error || createHttpError(500, "Status gagal render tidak bisa disimpan.");
  }
  return mapGenerationSession(result.data);
}

async function synthesizeGenerationSessionTts(
  env: WorkerEnv,
  context: AuthContext,
  sessionId: string
): Promise<Response> {
  const session = await getGenerationSessionForUser(context, sessionId);
  const settings = await getSettings(context.serviceDb);
  if (!session.script_text) {
    throw createHttpError(400, "Session ini belum memiliki naskah untuk TTS.");
  }

  const voice = session.voice_name ? findTtsVoiceByName(session.voice_name) : undefined;
  const voiceName = voice?.voiceName || session.voice_name || findGenderVoiceSetting(settings, session.voice_gender)?.voiceName;
  if (!voiceName) {
    throw createHttpError(500, "Voice default session belum tersedia.");
  }
  const speechRate = Number(session.speech_rate) || 1;

  const audio = await generateOpenRouterAudio(env, settings, {
    text: session.script_text,
    voiceName,
    speechRate,
    deliveryHint: `${session.tone} dan ${voice?.tone?.toLowerCase() || "natural"} untuk video pendek Indonesia`
  });

  const updateResult = await context.serviceDb
    .from("generation_sessions")
    .update({
      status: "ready_for_render",
      error_message: null
    })
    .eq("session_id", sessionId)
    .select("session_id")
    .single();
  if (updateResult.error) {
    throw updateResult.error;
  }

  return new Response(new Blob([Uint8Array.from(audio.bytes)], { type: audio.mimeType }), {
    status: 200,
    headers: {
      "Content-Type": audio.mimeType,
      "Cache-Control": "private, no-store",
      "X-Voice-Name": voiceName,
      ...buildCorsHeaders(new Request("http://localhost"))
    }
  });
}

async function previewVoice(env: WorkerEnv, context: AuthContext, payload: Record<string, unknown>): Promise<Response> {
  const settings = await getSettings(context.serviceDb);
  const voiceName = assertString(payload.voiceName, "Voice name") || "";
  const voice = findTtsVoiceByName(voiceName);
  if (!voice) {
    throw createHttpError(400, `Voice ${voiceName} tidak tersedia.`);
  }

  const audio = await generateOpenRouterAudio(env, settings, {
    text:
      assertString(payload.text, "Teks preview", { required: false, max: 220 }) ||
      "Halo, ini contoh voice over Bahasa Indonesia untuk video pendek yang natural dan jelas.",
    voiceName: voice.voiceName,
    speechRate: assertSpeechRate(payload.speechRate ?? 1),
    deliveryHint: `${voice.tone.toLowerCase()} dan natural untuk voice over video Indonesia`
  });

  return new Response(new Blob([Uint8Array.from(audio.bytes)], { type: audio.mimeType }), {
    status: 200,
    headers: {
      "Content-Type": audio.mimeType,
      "Cache-Control": "private, no-store"
    }
  });
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

async function createTopup(context: AuthContext, env: WorkerEnv, packageCode: string) {
  const selectedPackage = getDepositPackage(packageCode);
  if (!selectedPackage) {
    throw createHttpError(400, "Paket deposit tidak tersedia.");
  }
  const apiToken = String(env.WEBQRIS_API_TOKEN || "").trim();
  if (!apiToken) {
    throw createHttpError(503, "WEBQRIS_API_TOKEN belum dikonfigurasi.");
  }

  const merchantOrderId = `VS-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const inserted = await context.serviceDb
    .from("payment_orders")
    .insert({
      owner_user_id: context.user.id,
      owner_email: context.user.email,
      package_code: selectedPackage.code,
      pay_amount_idr: selectedPackage.payAmountIdr,
      credit_amount_idr: selectedPackage.creditAmountIdr,
      merchant_order_id: merchantOrderId
    })
    .select("*")
    .single<PaymentOrderRow>();
  if (inserted.error || !inserted.data) {
    throw inserted.error || createHttpError(500, "Invoice top up tidak bisa dibuat.");
  }

  const webqrisBaseUrl = trimTrailingSlash(String(env.WEBQRIS_BASE_URL || "https://webqris.com"));
  const response = await fetch(`${webqrisBaseUrl}/api/payments/qris/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: selectedPackage.payAmountIdr,
      merchant_order_id: merchantOrderId,
      customer_name: context.user.displayName || context.user.email
    })
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    !response.ok ||
    payload.success !== true ||
    typeof payload.invoice_id !== "string" ||
    typeof payload.qris_payload !== "string"
  ) {
    await context.serviceDb
      .from("payment_orders")
      .update({
        status: "failed",
        raw_create_response: payload,
        updated_at: nowIso()
      })
      .eq("id", inserted.data.id);
    throw createHttpError(response.ok ? 502 : response.status, String(payload.message || "Gagal membuat invoice WebQRIS."));
  }

  const updated = await context.serviceDb
    .from("payment_orders")
    .update({
      webqris_invoice_id: payload.invoice_id,
      qris_payload: payload.qris_payload,
      unique_code: Number(payload.unique_code) || null,
      total_amount_idr: Number(payload.total_amount || payload.amount) || selectedPackage.payAmountIdr,
      expired_at: typeof payload.expired_at === "string" ? payload.expired_at : null,
      raw_create_response: payload,
      updated_at: nowIso()
    })
    .eq("id", inserted.data.id)
    .select("*")
    .single<PaymentOrderRow>();
  if (updated.error || !updated.data) {
    throw updated.error || createHttpError(500, "Invoice WebQRIS tidak bisa disimpan.");
  }
  return walletSummaryToApiTopup(updated.data);
}

function walletSummaryToApiTopup(entry: PaymentOrderRow) {
  return {
    id: entry.id,
    packageCode: entry.package_code,
    payAmountIdr: entry.pay_amount_idr,
    creditAmountIdr: entry.credit_amount_idr,
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

    if (route.path === "/api/tts/voices" && request.method === "GET") {
      return jsonResponse(
        {
          voices: GEMINI_TTS_VOICES,
          excitedPresets: GEMINI_EXCITED_PRESETS
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

    const context = await requireAuth(request, env);

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
      return jsonResponse(await getSettings(context.serviceDb), {
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
          script_model: nextSettings.scriptModel,
          tts_model: nextSettings.ttsModel,
          language: nextSettings.language,
          max_video_seconds: nextSettings.maxVideoSeconds,
          safety_mode: nextSettings.safetyMode,
          concurrency: nextSettings.concurrency,
          gender_voices: nextSettings.genderVoices
        }, { onConflict: "settings_key" });
      if (result.error) {
        throw result.error;
      }
      return jsonResponse(nextSettings, {
        headers: buildCorsHeaders(request)
      });
    }

    if (route.path === "/api/tts/preview" && request.method === "POST") {
      const payload = (await parseJsonRequest(request)) as Record<string, unknown>;
      const response = await previewVoice(env, context, payload);
      const headers = new Headers(response.headers);
      Object.entries(buildCorsHeaders(request)).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
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

    if (route.parts[0] === "api" && route.parts[1] === "generation-sessions" && route.parts[3] === "tts" && request.method === "POST") {
      const response = await synthesizeGenerationSessionTts(env, context, route.parts[2] || "");
      const headers = new Headers(response.headers);
      Object.entries(buildCorsHeaders(request)).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }

    if (route.parts[0] === "api" && route.parts[1] === "generation-sessions" && route.parts[3] === "complete" && request.method === "POST") {
      const payload = parseGenerationSessionCompleteInput(await parseJsonRequest(request));
      return jsonResponse(
        {
          session: await markGenerationSessionComplete(context, route.parts[2] || "", payload)
        },
        { headers: buildCorsHeaders(request) }
      );
    }

    if (route.parts[0] === "api" && route.parts[1] === "generation-sessions" && route.parts[3] === "fail" && request.method === "POST") {
      const payload = (await parseJsonRequest(request)) as Record<string, unknown>;
      return jsonResponse(
        {
          session: await markGenerationSessionFailed(context, route.parts[2] || "", {
            reason: typeof payload.reason === "string" ? payload.reason : undefined,
            retryable: payload.retryable === undefined ? true : Boolean(payload.retryable)
          })
        },
        { headers: buildCorsHeaders(request) }
      );
    }

    throw createHttpError(404, "Route API tidak ditemukan.");
  } catch (error) {
    return errorResponse(request, error, "Terjadi kesalahan pada sistem.");
  }
}
