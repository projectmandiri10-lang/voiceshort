import dotenv from "dotenv";
import path from "node:path";
import {
  DEFAULT_AIVENE_BASE_URL,
  DEFAULT_AIVENE_SCRIPT_MODEL,
  DEFAULT_AIVENE_TTS_MODEL,
  DEFAULT_OPENROUTER_TTS_MODEL,
  DEFAULT_PORT
} from "./constants.js";
import { DEFAULT_SUCCESS_OUTPUT_RETENTION_HOURS } from "./services/success-output-retention.js";
import { ROOT_DIR } from "./utils/paths.js";

dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: true });

export interface AppEnv {
  aiProvider: "aivene";
  aiveneApiKey: string;
  aiveneBaseUrl: string;
  scriptProvider: "aivene" | "openrouter";
  scriptFallbackProvider: "aivene" | "openrouter";
  scriptModel: string;
  ttsProvider: "aivene" | "openrouter";
  ttsFallbackProvider: "aivene" | "openrouter";
  ttsModel: string;
  openrouterApiKey: string;
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

function parseProvider(raw: string | undefined, fallback: AppEnv["scriptProvider"]): AppEnv["scriptProvider"] {
  return raw === "aivene" || raw === "openrouter" ? raw : fallback;
}

export function loadEnv(): AppEnv {
  const legacyAiProvider = process.env.AI_PROVIDER?.trim();
  const aiProvider: AppEnv["aiProvider"] = "aivene";
  const scriptProvider = parseProvider(
    process.env.SCRIPT_PROVIDER?.trim(),
    parseProvider(legacyAiProvider, "aivene")
  );
  const scriptFallbackProvider = parseProvider(
    process.env.SCRIPT_FALLBACK_PROVIDER?.trim(),
    scriptProvider === "aivene" ? "openrouter" : "aivene"
  );
  const ttsProvider = parseProvider(
    process.env.TTS_PROVIDER?.trim(),
    parseProvider(legacyAiProvider, "aivene")
  );
  const ttsFallbackProvider = parseProvider(
    process.env.TTS_FALLBACK_PROVIDER?.trim(),
    ttsProvider === "aivene" ? "openrouter" : "aivene"
  );
  const scriptModel =
    scriptProvider === "aivene"
      ? process.env.AIVENE_SCRIPT_MODEL?.trim() || DEFAULT_AIVENE_SCRIPT_MODEL
      : process.env.OPENROUTER_SCRIPT_MODEL?.trim() || DEFAULT_AIVENE_SCRIPT_MODEL;
  const ttsModel =
    ttsProvider === "aivene"
      ? process.env.AIVENE_TTS_MODEL?.trim() || DEFAULT_AIVENE_TTS_MODEL
      : process.env.OPENROUTER_TTS_MODEL?.trim() || DEFAULT_OPENROUTER_TTS_MODEL;
  const aiveneApiKey = process.env.AIVENE_API_KEY?.trim() || "";
  const aiveneBaseUrl = process.env.AIVENE_BASE_URL?.trim() || DEFAULT_AIVENE_BASE_URL;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
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

  const needsAivene =
    scriptProvider === "aivene" ||
    scriptFallbackProvider === "aivene" ||
    ttsProvider === "aivene" ||
    ttsFallbackProvider === "aivene";
  const needsOpenRouter =
    scriptProvider === "openrouter" ||
    scriptFallbackProvider === "openrouter" ||
    ttsProvider === "openrouter" ||
    ttsFallbackProvider === "openrouter";

  if (needsAivene && !aiveneApiKey) {
    throw new Error("AIVENE_API_KEY wajib diisi.");
  }
  if (needsOpenRouter && !openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY wajib diisi.");
  }
  if (!scriptModel) {
    throw new Error("Model script wajib diisi.");
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
    throw new Error("WEB_ORIGIN tidak valid. Isi minimal satu origin, contoh: http://localhost:5174");
  }

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY wajib diisi pada .env.");
  }

  if (!Number.isFinite(generatePriceIdr) || generatePriceIdr <= 0) {
    throw new Error(`GENERATE_PRICE_IDR tidak valid: ${generatePriceRaw}`);
  }

  if (!Number.isFinite(successOutputRetentionHours) || successOutputRetentionHours <= 0) {
    throw new Error(`SUCCESS_OUTPUT_RETENTION_HOURS tidak valid: ${successOutputRetentionHoursRaw}`);
  }

  return {
    aiProvider,
    aiveneApiKey,
    aiveneBaseUrl,
    scriptProvider,
    scriptFallbackProvider,
    scriptModel,
    ttsProvider,
    ttsFallbackProvider,
    ttsModel,
    openrouterApiKey,
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
