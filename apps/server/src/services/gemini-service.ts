import { GoogleGenAI } from "@google/genai/node";
import type { FastifyBaseLogger } from "fastify";
import type {
  GenerateCaptionMetadataInput,
  GenerateScriptInput,
  GenerateSpeechInput,
  GenerateVisualBriefInput,
  UploadedGeminiVideo
} from "../types.js";
import { withRetry } from "../utils/retry.js";
import {
  extractAudioFromResponse,
  extractScriptText,
  extractSocialMetadata,
  extractVisualBrief
} from "../utils/model-output.js";

const FILE_READY_POLL_INTERVAL_MS = 2000;
const FILE_READY_MAX_ATTEMPTS = 30;
const MAX_RETRY_DELAY_MS = 60_000;

interface ParsedGeminiApiError {
  code?: number;
  status?: string;
  retryDelayMs?: number;
  quotaId?: string;
}

export class InvalidGeminiStructuredOutputError extends Error {
  public readonly outputType: "visualBrief";

  public constructor(outputType: "visualBrief", message: string) {
    super(message);
    this.name = "InvalidGeminiStructuredOutputError";
    this.outputType = outputType;
  }
}

function parseRetryDelayMs(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.trim();
  const secondsMatch = value.match(/^(\d+(?:\.\d+)?)s$/i);
  if (secondsMatch) {
    return Math.round(Number(secondsMatch[1]) * 1000);
  }
  const numberMatch = value.match(/^(\d+(?:\.\d+)?)$/);
  if (numberMatch) {
    return Math.round(Number(numberMatch[1]) * 1000);
  }
  return undefined;
}

function parseGeminiApiError(error: unknown): ParsedGeminiApiError {
  const message = String((error as { message?: string })?.message || "");
  const parsed: ParsedGeminiApiError = {};

  try {
    const payload = JSON.parse(message) as {
      error?: {
        code?: number;
        status?: string;
        details?: Array<Record<string, unknown>>;
      };
    };
    parsed.code = payload.error?.code;
    parsed.status = payload.error?.status;

    for (const detail of payload.error?.details || []) {
      const detailType = String(detail["@type"] || "");
      if (detailType.includes("RetryInfo")) {
        parsed.retryDelayMs = parseRetryDelayMs(String(detail["retryDelay"] || ""));
      }
      if (detailType.includes("QuotaFailure")) {
        const violations = (detail["violations"] as Array<Record<string, unknown>> | undefined) || [];
        const firstViolation = violations[0];
        const quotaId = String(firstViolation?.quotaId || "").trim();
        if (quotaId) {
          parsed.quotaId = quotaId;
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  if (!parsed.retryDelayMs) {
    const retryFromMessage = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
    if (retryFromMessage) {
      parsed.retryDelayMs = Math.round(Number(retryFromMessage[1]) * 1000);
    }
  }

  return parsed;
}

function isDailyQuotaExceeded(error: unknown): boolean {
  const parsed = parseGeminiApiError(error);
  const quotaId = (parsed.quotaId || "").toLowerCase();
  return quotaId.includes("perday");
}

function isTransientError(error: unknown): boolean {
  if (isDailyQuotaExceeded(error)) {
    return false;
  }

  const parsed = parseGeminiApiError(error);
  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return (
    parsed.code === 429 ||
    parsed.status === "RESOURCE_EXHAUSTED" ||
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("rate") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("unavailable") ||
    message.includes("failed_precondition") ||
    message.includes("not in an active state")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(error: unknown, _attempt: number, fallbackDelayMs: number): number {
  const parsed = parseGeminiApiError(error);
  const fromApi = parsed.retryDelayMs;
  if (!fromApi || !Number.isFinite(fromApi) || fromApi <= 0) {
    return fallbackDelayMs;
  }
  return Math.min(Math.max(fromApi, fallbackDelayMs), MAX_RETRY_DELAY_MS);
}

export class GeminiService {
  private readonly client: GoogleGenAI;

  public constructor(
    apiKey: string,
    private readonly logger: FastifyBaseLogger
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private buildUserParts(prompt: string, video?: UploadedGeminiVideo) {
    if (!video) {
      return [{ text: prompt }];
    }

    return [
      {
        fileData: {
          fileUri: video.fileUri,
          mimeType: video.mimeType
        }
      },
      { text: prompt }
    ];
  }

  private async generateUserContent(input: {
    model: string;
    prompt: string;
    video?: UploadedGeminiVideo;
    config?: Record<string, unknown>;
  }) {
    return await this.client.models.generateContent({
      model: input.model,
      contents: [
        {
          role: "user",
          parts: this.buildUserParts(input.prompt, input.video)
        }
      ],
      config: input.config
    });
  }

  public async uploadVideo(
    filePath: string,
    mimeType: string
  ): Promise<UploadedGeminiVideo> {
    const uploaded = await withRetry(
      async () =>
        this.client.files.upload({
          file: filePath,
          config: {
            mimeType
          }
        }),
      {
        attempts: 3,
        baseDelayMs: 700,
        shouldRetry: isTransientError,
        getDelayMs: retryDelayMs
      }
    );

    if (!uploaded.name || !uploaded.uri || !uploaded.mimeType) {
      throw new Error("Upload video ke Gemini gagal: URI tidak tersedia.");
    }

    await this.waitUntilFileActive(uploaded.name);

    return {
      fileUri: uploaded.uri,
      mimeType: uploaded.mimeType
    };
  }

  public async generateScript(input: GenerateScriptInput): Promise<string> {
    const run = async (prompt: string): Promise<string> => {
      const response = await this.generateUserContent({
        model: input.model,
        prompt,
        video: input.video
      });
      return extractScriptText(response);
    };

    let script = await withRetry(() => run(input.prompt), {
      attempts: 3,
      baseDelayMs: 700,
      shouldRetry: isTransientError,
      getDelayMs: retryDelayMs
    });

    if (!script) {
      this.logger.warn("Script kosong, mencoba ulang dengan strict prompt.");
      script = await run(
        `${input.prompt}\n\nKembalikan hanya satu paragraf naskah final tanpa format markdown.`
      );
    }

    if (!script) {
      throw new Error("Gemini mengembalikan script kosong.");
    }
    return script;
  }

  public async generateVisualBrief(input: GenerateVisualBriefInput) {
    const run = async (prompt: string) => {
      const response = await this.generateUserContent({
        model: input.model,
        prompt,
        video: input.video
      });
      try {
        return extractVisualBrief(response);
      } catch (error) {
        throw new InvalidGeminiStructuredOutputError(
          "visualBrief",
          (error as { message?: string })?.message || "Visual brief Gemini tidak valid."
        );
      }
    };

    const execute = async (prompt: string) =>
      await withRetry(() => run(prompt), {
        attempts: 3,
        baseDelayMs: 700,
        shouldRetry: isTransientError,
        getDelayMs: retryDelayMs
      });

    try {
      return await execute(input.prompt);
    } catch (error) {
      if (!(error instanceof InvalidGeminiStructuredOutputError)) {
        throw error;
      }

      this.logger.warn(
        { err: error },
        "Visual brief tidak valid, mencoba ulang dengan strict JSON prompt."
      );
      return await execute(
        `${input.prompt}\n\nKembalikan hanya JSON valid sesuai struktur yang diminta, tanpa markdown dan tanpa teks tambahan.`
      );
    }
  }

  public async generateCaptionMetadata(
    input: GenerateCaptionMetadataInput
  ): Promise<{ caption: string; hashtags: string[] }> {
    const run = async (prompt: string): Promise<{ caption: string; hashtags: string[] }> => {
      const response = await this.generateUserContent({
        model: input.model,
        prompt,
        video: input.video
      });
      return extractSocialMetadata(response);
    };

    let social = await withRetry(() => run(input.prompt), {
      attempts: 3,
      baseDelayMs: 700,
      shouldRetry: isTransientError,
      getDelayMs: retryDelayMs
    });

    if (!social.caption && social.hashtags.length === 0) {
      this.logger.warn("Caption metadata kosong, mencoba ulang dengan strict prompt.");
      social = await run(
        `${input.prompt}\n\nKembalikan hanya JSON valid tanpa markdown dan tanpa teks tambahan.`
      );
    }

    return social;
  }

  public async generateSpeech(
    input: GenerateSpeechInput
  ): Promise<{ data: Buffer; mimeType: string }> {
    const execute = async () => {
      const response = await this.generateUserContent({
        model: input.model,
        prompt: input.text,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: input.voiceName
              }
            }
          }
        }
      });
      return extractAudioFromResponse(response);
    };

    return await withRetry(execute, {
      attempts: 3,
      baseDelayMs: 700,
      shouldRetry: isTransientError,
      getDelayMs: retryDelayMs
    });
  }

  private async waitUntilFileActive(fileName: string): Promise<void> {
    let lastState = "unknown";
    for (let attempt = 1; attempt <= FILE_READY_MAX_ATTEMPTS; attempt += 1) {
      const file = await this.client.files.get({ name: fileName });
      lastState = file.state || "unknown";

      if (file.state === "ACTIVE") {
        return;
      }

      if (file.state === "FAILED") {
        const reason = file.error?.message || "Pemrosesan file gagal di Gemini.";
        throw new Error(`Upload video gagal diproses: ${reason}`);
      }

      this.logger.debug(
        { fileName, attempt, state: file.state },
        "Menunggu file upload Gemini menjadi ACTIVE."
      );

      await sleep(FILE_READY_POLL_INTERVAL_MS);
    }

    throw new Error(
      `File Gemini belum ACTIVE setelah ${
        FILE_READY_MAX_ATTEMPTS * FILE_READY_POLL_INTERVAL_MS
      } ms (state terakhir: ${lastState}).`
    );
  }
}
