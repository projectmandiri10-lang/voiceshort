import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { AiService } from "./ai-service.js";
import { InvalidGeminiStructuredOutputError } from "./ai-service.js";
import type {
  GenerateCaptionMetadataInput,
  GenerateScriptInput,
  GenerateSpeechInput,
  GenerateVisualBriefInput,
  UploadedAiFile
} from "../types.js";
import { withRetry } from "../utils/retry.js";
import {
  extractAudioFromResponse,
  extractScriptText,
  extractSocialMetadata,
  extractVisualBrief
} from "../utils/model-output.js";
import { buildSpeechSynthesisPrompt } from "./prompt-builder.js";

const MAX_RETRY_DELAY_MS = 60_000;

interface LiteLlmServiceOptions {
  baseUrl: string;
  apiKey: string;
  scriptModel: string;
  ttsModel: string;
  fileTargetModel: string;
  logger: FastifyBaseLogger;
}

class LiteLlmHttpError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
    public readonly bodyText: string
  ) {
    super(message);
    this.name = "LiteLlmHttpError";
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isTransientError(error: unknown): boolean {
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

function retryDelayMs(error: unknown, _attempt: number, fallbackDelayMs: number): number {
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

export class LiteLlmService implements AiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly scriptModel: string;
  private readonly ttsModel: string;
  private readonly fileTargetModel: string;
  private readonly logger: FastifyBaseLogger;

  public constructor(options: LiteLlmServiceOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey.trim();
    this.scriptModel = options.scriptModel.trim();
    this.ttsModel = options.ttsModel.trim();
    this.fileTargetModel = options.fileTargetModel.trim() || this.scriptModel;
    this.logger = options.logger;
  }

  private buildHeaders(json = true): HeadersInit {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  private buildUserContent(prompt: string, video?: UploadedAiFile) {
    if (!video) {
      return prompt;
    }

    if (!video.fileId) {
      throw new Error("Referensi file LiteLLM tidak memiliki fileId.");
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

  private async parseJsonResponse(response: Response): Promise<unknown> {
    const raw = await response.text();
    if (!response.ok) {
      let message = `LiteLLM request gagal (${response.status}).`;
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
      throw new LiteLlmHttpError(message, response.status, raw);
    }

    if (!raw.trim()) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Respons LiteLLM bukan JSON valid: ${
          (error as { message?: string })?.message || "parse error"
        }`
      );
    }
  }

  private async requestJson(pathname: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method: "POST",
      headers: this.buildHeaders(true),
      body: JSON.stringify(body)
    });
    return await this.parseJsonResponse(response);
  }

  private async generateUserContent(input: {
    model: string;
    prompt: string;
    video?: UploadedAiFile;
  }): Promise<unknown> {
    return await this.requestJson("/v1/chat/completions", {
      model: input.model,
      messages: [
        {
          role: "user",
          content: this.buildUserContent(input.prompt, input.video)
        }
      ]
    });
  }

  public async uploadVideo(
    filePath: string,
    mimeType: string
  ): Promise<UploadedAiFile> {
    return await withRetry(
      async () => {
        const fileBuffer = await readFile(filePath);
        const form = new FormData();
        form.append("purpose", "user_data");
        form.append("custom_llm_provider", "gemini");
        form.append("target_model_names", JSON.stringify([this.fileTargetModel]));
        form.append(
          "file",
          new Blob([fileBuffer], { type: mimeType }),
          path.basename(filePath)
        );

        const response = await fetch(`${this.baseUrl}/v1/files`, {
          method: "POST",
          headers: this.buildHeaders(false),
          body: form
        });
        const parsed = (await this.parseJsonResponse(response)) as {
          id?: string;
        };

        if (!parsed.id) {
          throw new Error("Upload video ke LiteLLM gagal: file id tidak tersedia.");
        }

        return {
          provider: "litellm",
          fileId: parsed.id,
          mimeType
        };
      },
      {
        attempts: 3,
        baseDelayMs: 700,
        shouldRetry: isTransientError,
        getDelayMs: retryDelayMs
      }
    );
  }

  public async generateScript(input: GenerateScriptInput): Promise<string> {
    const execute = async (prompt: string) => {
      const response = await this.generateUserContent({
        model: input.model || this.scriptModel,
        prompt,
        video: input.video
      });
      return extractScriptText(response);
    };

    let script = await withRetry(() => execute(input.prompt), {
      attempts: 3,
      baseDelayMs: 700,
      shouldRetry: isTransientError,
      getDelayMs: retryDelayMs
    });

    if (!script) {
      this.logger.warn("Script kosong dari LiteLLM, mencoba ulang dengan strict prompt.");
      script = await execute(
        `${input.prompt}\n\nKembalikan hanya satu paragraf naskah final tanpa format markdown.`
      );
    }

    if (!script) {
      throw new Error("Layanan LiteLLM mengembalikan naskah kosong.");
    }
    return script;
  }

  public async generateVisualBrief(input: GenerateVisualBriefInput) {
    const run = async (prompt: string) => {
      const response = await this.generateUserContent({
        model: input.model || this.scriptModel,
        prompt,
        video: input.video
      });
      try {
        return extractVisualBrief(response);
      } catch (error) {
        throw new InvalidGeminiStructuredOutputError(
          "visualBrief",
          (error as { message?: string })?.message || "Analisis visual tidak valid."
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
        "Visual brief LiteLLM tidak valid, mencoba ulang dengan strict JSON prompt."
      );
      return await execute(
        `${input.prompt}\n\nKembalikan hanya JSON valid sesuai struktur yang diminta, tanpa markdown dan tanpa teks tambahan.`
      );
    }
  }

  public async generateCaptionMetadata(
    input: GenerateCaptionMetadataInput
  ): Promise<{ caption: string; hashtags: string[] }> {
    const execute = async (prompt: string) => {
      const response = await this.generateUserContent({
        model: input.model || this.scriptModel,
        prompt,
        video: input.video
      });
      return extractSocialMetadata(response);
    };

    let social = await withRetry(() => execute(input.prompt), {
      attempts: 3,
      baseDelayMs: 700,
      shouldRetry: isTransientError,
      getDelayMs: retryDelayMs
    });

    if (!social.caption && social.hashtags.length === 0) {
      this.logger.warn("Caption LiteLLM kosong, mencoba ulang dengan strict prompt.");
      social = await execute(
        `${input.prompt}\n\nKembalikan hanya JSON valid tanpa markdown dan tanpa teks tambahan.`
      );
    }

    return social;
  }

  public async generateSpeech(
    input: GenerateSpeechInput
  ): Promise<{ data: Buffer; mimeType: string }> {
    const execute = async () => {
      const response = await this.requestJson("/v1/chat/completions", {
        model: input.model || this.ttsModel,
        messages: [
          {
            role: "system",
            content:
              "You are a realistic Indonesian voice actor for short-form video narration. Follow the script exactly and do not add or remove words."
          },
          {
            role: "user",
            content: buildSpeechSynthesisPrompt({
              text: input.text,
              deliveryHint: input.deliveryHint
            })
          }
        ],
        modalities: ["audio"],
        audio: {
          voice: input.voiceName,
          format: "pcm16"
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
}
