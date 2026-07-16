import dotenv from "dotenv";
import path from "node:path";
import {
  DEFAULT_AIVENE_BASE_URL,
  DEFAULT_AIVENE_SCRIPT_MODEL,
  DEFAULT_PORT
} from "./constants.js";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

export interface AppEnv {
  port: number;
  webOrigins: string[];
  aiveneApiKey: string;
  aiveneBaseUrl: string;
  scriptProvider: "aivene";
  scriptFallbackProvider: "aivene";
  scriptModel: string;
}

export function loadEnv(): AppEnv {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const aiveneApiKey = process.env.AIVENE_API_KEY?.trim() || "";
  if (!Number.isFinite(port) || port <= 0) throw new Error("PORT tidak valid.");
  if (!aiveneApiKey) {
    throw new Error("AIVENE_API_KEY wajib diisi.");
  }
  return {
    port,
    webOrigins: (process.env.WEB_ORIGIN || "http://localhost:5174").split(",").map((item) => item.trim()).filter(Boolean),
    aiveneApiKey,
    aiveneBaseUrl: process.env.AIVENE_BASE_URL?.trim() || DEFAULT_AIVENE_BASE_URL,
    scriptProvider: "aivene",
    scriptFallbackProvider: "aivene",
    scriptModel: process.env.AIVENE_SCRIPT_MODEL?.trim() || DEFAULT_AIVENE_SCRIPT_MODEL
  };
}
