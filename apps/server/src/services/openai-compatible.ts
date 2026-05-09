import type { UploadedAiFile } from "../types.js";

const MAX_RETRY_DELAY_MS = 60_000;

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
  return baseUrl.replace(/\/+$/, "");
}

export function isOpenAiCompatibleTransientError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (typeof statusCode === "number") {
    return statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500;
  }

  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("unavailable") ||
    message.includes("rate") ||
    message.includes("overloaded")
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

export function buildOpenAiCompatibleUserContent(prompt: string, video?: UploadedAiFile) {
  if (!video) {
    return prompt;
  }

  if (!video.fileId) {
    throw new Error("Referensi file OpenAI-compatible tidak memiliki fileId.");
  }

  return [
    {
      type: "file",
      file: {
        file_id: video.fileId
      }
    },
    {
      type: "text",
      text: prompt
    }
  ];
}

export async function parseOpenAiCompatibleJsonResponse(
  response: Response,
  providerName: string
): Promise<unknown> {
  const raw = await response.text();
  if (!response.ok) {
    let message = `${providerName} request gagal (${response.status}).`;
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string };
        message?: string;
      };
      message = parsed.error?.message || parsed.message || message;
    } catch {
      if (raw.trim()) {
        message = `${message} ${raw.trim()}`;
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
