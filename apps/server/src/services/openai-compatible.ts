import * as dns from "node:dns";
import * as net from "node:net";
import type { UploadedAiFile } from "../types.js";

const MAX_RETRY_DELAY_MS = 60_000;
const DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS = 300_000;
const DEFAULT_OPENAI_COMPATIBLE_UPLOAD_TIMEOUT_MS = 300_000;

export class OpenAiCompatibleHttpError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
    public readonly bodyText: string
  ) {
    super(message);
    this.name = "OpenAiCompatibleHttpError";
  }
}

export function normalizeOpenAiCompatibleBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export function applyOpenAiCompatibleNetworkWorkaround(
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== "win32") {
    return;
  }

  // Recent Node builds on Windows can reset TLS handshakes to some
  // Cloudflare-proxied OpenAI-compatible hosts unless IPv4 is preferred.
  dns.setDefaultResultOrder("ipv4first");
  net.setDefaultAutoSelectFamily(false);
}

export function isOpenAiCompatibleTransientError(error: unknown): boolean {
  const errorName = String((error as { name?: string })?.name || "");
  if (errorName === "AbortError") {
    return true;
  }

  const causeCode = String(
    (error as { cause?: { code?: string } })?.cause?.code ||
      (error as { code?: string })?.code ||
      ""
  );
  if (causeCode.startsWith("UND_ERR_") || causeCode.startsWith("ECONN")) {
    return true;
  }

  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (typeof statusCode === "number") {
    return statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500;
  }

  const message = [
    String((error as { message?: string })?.message || error),
    String((error as { cause?: { message?: string } })?.cause?.message || "")
  ]
    .join(" ")
    .toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("connect") ||
    message.includes("429") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("unavailable") ||
    message.includes("rate") ||
    message.includes("overloaded") ||
    message.includes("timed out")
  );
}

export function openAiCompatibleRetryDelayMs(
  error: unknown,
  _attempt: number,
  fallbackDelayMs: number
): number {
  const bodyText = String((error as { bodyText?: string })?.bodyText || "");
  const parsedSeconds = bodyText.match(/retry(?:_after| after)?["=: ]+(\d+(?:\.\d+)?)/i);
  if (!parsedSeconds) {
    return fallbackDelayMs;
  }
  const delayMs = Math.round(Number(parsedSeconds[1]) * 1000);
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return fallbackDelayMs;
  }
  return Math.min(Math.max(delayMs, fallbackDelayMs), MAX_RETRY_DELAY_MS);
}

export function buildOpenAiCompatibleUserContent(prompt: string, video?: UploadedAiFile | UploadedAiFile[]) {
  const files = Array.isArray(video) ? video : (video ? [video] : []);
  
  if (files.length === 0) {
    return prompt;
  }

  const parts: any[] = files.map(file => {
    if (file.base64Data) {
      return {
        type: "image_url",
        image_url: {
          url: `data:${file.mimeType};base64,${file.base64Data}`
        }
      };
    }
    
    if (!file.fileId) {
      throw new Error("Referensi file OpenAI-compatible tidak memiliki fileId atau base64Data.");
    }
    return {
      type: "file",
      file: {
        file_id: file.fileId
      }
    };
  });

  return [
    ...parts,
    {
      type: "text",
      text: prompt
    }
  ];
}

function extractHtmlTitle(raw: string): string | undefined {
  const match = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]
    ?.replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_value, code: string) => String.fromCharCode(Number(code)))
    .trim();
  return title || undefined;
}

function buildGatewayErrorMessage(
  providerName: string,
  statusCode: number,
  raw: string
): string | undefined {
  if (statusCode === 524 || /error code 524|a timeout occurred/i.test(raw)) {
    return `${providerName} gateway timeout (524). Host proxy tidak merespons tepat waktu.`;
  }
  if (statusCode === 502 || /error code 502|bad gateway/i.test(raw)) {
    return `${providerName} bad gateway (502). Host proxy sedang bermasalah, coba lagi beberapa menit.`;
  }
  if ([520, 521, 522, 523].includes(statusCode) || /cloudflare/i.test(raw)) {
    const title = extractHtmlTitle(raw);
    return `${providerName} gateway error (${statusCode}). ${
      title || "Host proxy sedang bermasalah, coba lagi beberapa menit."
    }`;
  }
  return undefined;
}

export async function parseOpenAiCompatibleJsonResponse(
  response: Response,
  providerName: string
): Promise<unknown> {
  const raw = await response.text();
  if (!response.ok) {
    let message = `${providerName} request gagal (${response.status}).`;
    const gatewayMessage = buildGatewayErrorMessage(providerName, response.status, raw);
    if (gatewayMessage) {
      throw new OpenAiCompatibleHttpError(
        gatewayMessage,
        response.status,
        raw
      );
    }
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string };
        message?: string;
      };
      message = parsed.error?.message || parsed.message || message;
    } catch {
      if (raw.trim()) {
        const htmlTitle = extractHtmlTitle(raw);
        message = htmlTitle ? `${message} ${htmlTitle}` : `${message} ${raw.trim()}`;
      }
    }
    throw new OpenAiCompatibleHttpError(message, response.status, raw);
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Respons ${providerName} bukan JSON valid: ${
        (error as { message?: string })?.message || "parse error"
      }`
    );
  }
}

function buildTimeoutMessage(providerName: string, timeoutMs: number): string {
  const seconds = Number.isFinite(timeoutMs) ? Math.max(1, Math.round(timeoutMs / 1000)) : 0;
  return `${providerName} request timeout setelah ${seconds} detik.`;
}

function buildNetworkFailureMessage(providerName: string, url: string, error: unknown): string {
  const targetHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const cause = (error as { cause?: { code?: string; message?: string; name?: string } })?.cause;
  const causeMessage = cause?.message || (error as { message?: string })?.message || "fetch failed";
  const causeCode = cause?.code ? ` (${cause.code})` : "";
  return `${providerName} tidak bisa dijangkau di ${targetHost}: ${causeMessage}${causeCode}.`;
}

export async function fetchOpenAiCompatible(
  url: string,
  init: RequestInit,
  options: {
    providerName: string;
    timeoutMs?: number;
  }
): Promise<Response> {
  applyOpenAiCompatibleNetworkWorkaround();
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    const errorName = String((error as { name?: string })?.name || "");
    if (errorName === "AbortError") {
      throw new Error(buildTimeoutMessage(options.providerName, timeoutMs));
    }
    if (
      error instanceof TypeError ||
      (error as { cause?: unknown })?.cause ||
      String((error as { message?: string })?.message || "").toLowerCase().includes("fetch failed")
    ) {
      throw new Error(buildNetworkFailureMessage(options.providerName, url, error));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getOpenAiCompatibleUploadTimeoutMs(): number {
  return DEFAULT_OPENAI_COMPATIBLE_UPLOAD_TIMEOUT_MS;
}
