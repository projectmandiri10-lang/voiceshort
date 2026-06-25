import dotenv from "dotenv";
import path from "node:path";
import { DEFAULT_SUCCESS_OUTPUT_RETENTION_HOURS } from "./services/success-output-retention.js";
import { ROOT_DIR } from "./utils/paths.js";
import { DEFAULT_PORT } from "./constants.js";

dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: true });

export interface AppEnv {
  aiProvider: "gemini";
  geminiApiKey: string;
  scriptProvider: "gemini_direct" | "openrouter";
  scriptFallbackProvider: "gemini_direct" | "openrouter";
  geminiScriptModel: string;
  ttsProvider: "gemini_direct" | "openrouter";
  ttsFallbackProvider: "gemini_direct" | "openrouter";
  openrouterApiKey: string;
  openrouterTtsModel: string;
  port: number;
  webOrigins: string[];
  superadminEmail: string;
  appWebUrl: string;
  appApiUrl: string;
  appProdWebUrl: string;
  additionalRedirectUrls: string[];
  supabaseAccessToken: string;
  supabaseProjectRef: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  supabaseGoogleClientId: string;
  supabaseGoogleClientSecret: string;
  webqrisBaseUrl: string;
  webqrisApiToken: string;
  webqrisWebhookSecret: string;
  generatePriceIdr: number;
  successOutputRetentionHours: number;
}

export function loadEnv(): AppEnv {
  const aiProvider: AppEnv["aiProvider"] = "gemini";
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const scriptProvider: AppEnv["scriptProvider"] = (
    process.env.SCRIPT_PROVIDER?.trim() === "openrouter" ? "openrouter" : "gemini_direct"
  );
  const scriptFallbackProvider: AppEnv["scriptFallbackProvider"] = (
    process.env.SCRIPT_FALLBACK_PROVIDER?.trim() === "gemini_direct" ? "gemini_direct" : "openrouter"
  );
  const geminiScriptModel = process.env.GEMINI_SCRIPT_MODEL?.trim() ?? "";
  const ttsProvider: AppEnv["ttsProvider"] = (
    process.env.TTS_PROVIDER?.trim() === "gemini_direct" ? "gemini_direct" : "openrouter"
  );
  const ttsFallbackProvider: AppEnv["ttsFallbackProvider"] = (
    process.env.TTS_FALLBACK_PROVIDER?.trim() === "openrouter" ? "openrouter" : "gemini_direct"
  );
  const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const openrouterTtsModel =
    process.env.OPENROUTER_TTS_MODEL?.trim() || "google/gemini-3.1-flash-tts-preview";
  const portRaw = process.env.PORT?.trim();
  const port = portRaw ? Number(portRaw) : DEFAULT_PORT;
  const webOrigins = (process.env.WEB_ORIGIN?.trim() || "http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const superadminEmail = process.env.SUPERADMIN_EMAIL?.trim() || "jho.j80@gmail.com";
  const appWebUrl = process.env.APP_WEB_URL?.trim() || "http://localhost:5174";
  const appApiUrl = process.env.APP_API_URL?.trim() || `http://localhost:${port}`;
  const appProdWebUrl = process.env.APP_PROD_WEB_URL?.trim() || "";
  const additionalRedirectUrls = (process.env.ADDITIONAL_REDIRECT_URLS?.trim() || "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  const supabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() || "";
  const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF?.trim() || "";
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const supabaseGoogleClientId = process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID?.trim() || "";
  const supabaseGoogleClientSecret = process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET?.trim() || "";
  const webqrisBaseUrl = process.env.WEBQRIS_BASE_URL?.trim() || "https://webqris.com";
  const webqrisApiToken = process.env.WEBQRIS_API_TOKEN?.trim() || "";
  const webqrisWebhookSecret = process.env.WEBQRIS_WEBHOOK_SECRET?.trim() || "";
  const generatePriceRaw = process.env.GENERATE_PRICE_IDR?.trim();
  const generatePriceIdr = generatePriceRaw ? Number(generatePriceRaw) : 2000;
  const successOutputRetentionHoursRaw = process.env.SUCCESS_OUTPUT_RETENTION_HOURS?.trim();
  const successOutputRetentionHours = successOutputRetentionHoursRaw
    ? Number(successOutputRetentionHoursRaw)
    : DEFAULT_SUCCESS_OUTPUT_RETENTION_HOURS;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY wajib diisi.");
  }
  if (!geminiScriptModel) {
    throw new Error("GEMINI_SCRIPT_MODEL wajib diisi.");
  }
  if (!openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY wajib diisi.");
  }
  if (scriptProvider === scriptFallbackProvider) {
    throw new Error("SCRIPT_FALLBACK_PROVIDER wajib berbeda dari SCRIPT_PROVIDER.");
  }
  if (ttsProvider === ttsFallbackProvider) {
    throw new Error("TTS_FALLBACK_PROVIDER wajib berbeda dari TTS_PROVIDER.");
  }

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`PORT tidak valid: ${portRaw}`);
  }

  if (!webOrigins.length) {
    throw new Error(
      "WEB_ORIGIN tidak valid. Isi minimal satu origin, contoh: http://localhost:5174"
    );
  }

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY wajib diisi pada .env."
    );
  }

  if (!Number.isFinite(generatePriceIdr) || generatePriceIdr <= 0) {
    throw new Error(`GENERATE_PRICE_IDR tidak valid: ${generatePriceRaw}`);
  }

  if (
    !Number.isFinite(successOutputRetentionHours) ||
    successOutputRetentionHours <= 0
  ) {
    throw new Error(
      `SUCCESS_OUTPUT_RETENTION_HOURS tidak valid: ${successOutputRetentionHoursRaw}`
    );
  }

  return {
    aiProvider,
    geminiApiKey,
    scriptProvider,
    scriptFallbackProvider,
    geminiScriptModel,
    ttsProvider,
    ttsFallbackProvider,
    openrouterApiKey,
    openrouterTtsModel,
    port,
    webOrigins,
    superadminEmail,
    appWebUrl,
    appApiUrl,
    appProdWebUrl,
    additionalRedirectUrls,
    supabaseAccessToken,
    supabaseProjectRef,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    supabaseGoogleClientId,
    supabaseGoogleClientSecret,
    webqrisBaseUrl,
    webqrisApiToken,
    webqrisWebhookSecret,
    generatePriceIdr,
    successOutputRetentionHours
  };
}
