import dotenv from "dotenv";
import path from "node:path";
import {
  DEFAULT_AIVENE_BASE_URL,
  DEFAULT_AIVENE_SCRIPT_MODEL,
  DEFAULT_PORT,
  DEFAULT_ZAI_BASE_URL,
  DEFAULT_ZAI_SCRIPT_MODEL
} from "./constants.js";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

export interface AppEnv {
  port: number;
  webOrigins: string[];
  aiveneApiKey: string;
  aiveneBaseUrl: string;
  scriptProvider: "aivene" | "zai";
  scriptFallbackProvider: "aivene" | "zai";
  scriptModel: string;
  zaiApiKey: string;
  zaiBaseUrl: string;
  zaiScriptModel: string;
}

function provider(value: string | undefined, fallback: AppEnv["scriptProvider"]): AppEnv["scriptProvider"] {
  return value === "aivene" || value === "zai" ? value : fallback;
}

export function loadEnv(): AppEnv {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const scriptProvider = provider(process.env.SCRIPT_PROVIDER?.trim(), "aivene");
  const scriptFallbackProvider = provider(
    process.env.SCRIPT_FALLBACK_PROVIDER?.trim(),
    scriptProvider === "aivene" ? "zai" : "aivene"
  );
  const aiveneApiKey = process.env.AIVENE_API_KEY?.trim() || "";
  const zaiApiKey = process.env.ZAI_API_KEY?.trim() || "";
  if (!Number.isFinite(port) || port <= 0) throw new Error("PORT tidak valid.");
  if (scriptProvider === scriptFallbackProvider) throw new Error("Provider fallback script harus berbeda.");
  if ((scriptProvider === "aivene" || scriptFallbackProvider === "aivene") && !aiveneApiKey) {
    throw new Error("AIVENE_API_KEY wajib diisi.");
  }
  if ((scriptProvider === "zai" || scriptFallbackProvider === "zai") && !zaiApiKey) {
    throw new Error("ZAI_API_KEY wajib diisi.");
  }
  return {
    port,
    webOrigins: (process.env.WEB_ORIGIN || "http://localhost:5174").split(",").map((item) => item.trim()).filter(Boolean),
    aiveneApiKey,
    aiveneBaseUrl: process.env.AIVENE_BASE_URL?.trim() || DEFAULT_AIVENE_BASE_URL,
    scriptProvider,
    scriptFallbackProvider,
    scriptModel: process.env.AIVENE_SCRIPT_MODEL?.trim() || DEFAULT_AIVENE_SCRIPT_MODEL,
    zaiApiKey,
    zaiBaseUrl: process.env.ZAI_BASE_URL?.trim() || DEFAULT_ZAI_BASE_URL,
    zaiScriptModel: process.env.ZAI_SCRIPT_MODEL?.trim() || DEFAULT_ZAI_SCRIPT_MODEL
  };
}
