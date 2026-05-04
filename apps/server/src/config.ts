import dotenv from "dotenv";
import path from "node:path";
import { ROOT_DIR } from "./utils/paths.js";
import { DEFAULT_PORT } from "./constants.js";

dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: true });

export interface AppEnv {
  aiProvider: "gemini" | "litellm";
  geminiApiKey: string;
  litellmBaseUrl: string;
  litellmApiKey: string;
  litellmScriptModel: string;
  litellmTtsModel: string;
  litellmFileTargetModel: string;
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
}

export function loadEnv(): AppEnv {
  const aiProviderRaw = process.env.AI_PROVIDER?.trim().toLowerCase() || "litellm";
  const aiProvider =
    aiProviderRaw === "litellm" || aiProviderRaw === "gemini"
      ? aiProviderRaw
      : undefined;
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const litellmBaseUrl = process.env.LITELLM_BASE_URL?.trim() ?? "";
  const litellmApiKey = process.env.LITELLM_API_KEY?.trim() ?? "";
  const litellmScriptModel = process.env.LITELLM_SCRIPT_MODEL?.trim() ?? "";
  const litellmTtsModel = process.env.LITELLM_TTS_MODEL?.trim() ?? "";
  const litellmFileTargetModel =
    process.env.LITELLM_FILE_TARGET_MODEL?.trim() || litellmScriptModel;
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

  if (!aiProvider) {
    throw new Error(`AI_PROVIDER tidak valid: ${aiProviderRaw}`);
  }

  const invalidGeminiApiKeys = new Set(["", "your_api_key_here", "your_gemini_api_key"]);

  if (aiProvider === "gemini" && invalidGeminiApiKeys.has(geminiApiKey)) {
    throw new Error(
      "GEMINI_API_KEY tidak ditemukan. Isi file .env berdasarkan .env.example."
    );
  }

  if (aiProvider === "litellm") {
    if (!litellmBaseUrl) {
      throw new Error("LITELLM_BASE_URL wajib diisi saat AI_PROVIDER=litellm.");
    }
    if (!litellmScriptModel) {
      throw new Error("LITELLM_SCRIPT_MODEL wajib diisi saat AI_PROVIDER=litellm.");
    }
    if (!litellmTtsModel) {
      throw new Error("LITELLM_TTS_MODEL wajib diisi saat AI_PROVIDER=litellm.");
    }
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

  return {
    aiProvider,
    geminiApiKey,
    litellmBaseUrl,
    litellmApiKey,
    litellmScriptModel,
    litellmTtsModel,
    litellmFileTargetModel,
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
    generatePriceIdr
  };
}
