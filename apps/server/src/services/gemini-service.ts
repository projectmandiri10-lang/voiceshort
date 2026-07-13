import { readFile } from "node:fs/promises";
import type { FastifyBaseLogger } from "fastify";
import type { AiService } from "./ai-service.js";
import { InvalidGeminiStructuredOutputError } from "./ai-service.js";
import type {
  AiProvider,
  GenerateCaptionMetadataInput,
  GenerateScriptInput,
  GenerateSpeechInput,
  GenerateVisualBriefInput,
  UploadedAiFile
} from "../types.js";
import { withRetry } from "../utils/retry.js";
import {
  DEFAULT_AIVENE_BASE_URL,
  normalizeScriptModel,
  normalizeTtsModel
} from "../constants.js";
import {
  extractScriptText,
  extractSocialMetadata,
  extractVisualBrief
} from "../utils/model-output.js";

export { InvalidGeminiStructuredOutputError } from "./ai-service.js";

const MAX_RETRY_DELAY_MS = 60_000;
const OPENROUTER_TEXT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TTS_ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveAiveneChatEndpoint(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function resolveAiveneSpeechEndpoint(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (normalized.endsWith("/audio/speech")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/audio/speech`;
  }
  return `${normalized}/v1/audio/speech`;
}

function isTransientError(error: unknown): boolean {
  const status = Number((error as { status?: number })?.status || 0);
  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return (
    status === 429 ||
    status >= 500 ||
    message.includes("rate") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("unavailable") ||
    message.includes("upstream")
  );
}

function retryDelayMs(error: unknown, attempt: number, fallbackDelayMs: number): number {
  const retryAfterHeader = String((error as { retryAfter?: string })?.retryAfter || "").trim();
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(Math.round(retryAfterSeconds * 1000), MAX_RETRY_DELAY_MS);
  }
  return Math.min(fallbackDelayMs * Math.max(1, attempt), MAX_RETRY_DELAY_MS);
}

function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseErrorPayload(text: string): Record<string, unknown> {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function throwGatewayError(response: Response, payload: Record<string, unknown>, fallback: string): never {
  const message =
    typeof (payload.error as { message?: unknown } | undefined)?.message === "string"
      ? String((payload.error as { message?: unknown }).message)
      : typeof payload.message === "string"
        ? payload.message
        : fallback;
  throw Object.assign(new Error(message), {
    status: response.status === 429 ? 503 : response.status,
    retryAfter: response.headers.get("Retry-After") || undefined,
    details: payload
  });
}

function buildAiveneMessageContent(prompt: string, video?: UploadedAiFile | UploadedAiFile[]) {
  const files = Array.isArray(video) ? video : video ? [video] : [];
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];

  for (const file of files) {
    if (file.mimeType.startsWith("video/")) {
      if (file.base64Data) {
        content.push({
          type: "input_video",
          input_video: {
            data: file.base64Data,
            format: file.mimeType.split("/")[1] || "mp4"
          }
        });
      } else if (file.fileUri) {
        content.push({
          type: "input_video",
          input_video: {
            url: file.fileUri
          }
        });
      } else {
        throw new Error("Referensi video Aivene membutuhkan base64Data atau fileUri.");
      }
      continue;
    }

    if (file.base64Data) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${file.mimeType};base64,${file.base64Data}`
        }
      });
      continue;
    }

    if (!file.fileUri) {
      throw new Error("Referensi gambar Aivene membutuhkan base64Data atau fileUri.");
    }

    content.push({
      type: "image_url",
      image_url: {
        url: file.fileUri
      }
    });
  }

  return content;
}

export class GeminiService implements AiService {
  public readonly appliesSpeechRateNatively = true;

  public constructor(
    private readonly aiveneApiKey: string,
    private readonly aiveneBaseUrl: string,
    private readonly openrouterApiKey: string,
    private readonly logger: FastifyBaseLogger
  ) {}

  private shouldUseFallbackProvider(
    primary: AiProvider,
    fallback: AiProvider | undefined
  ): fallback is AiProvider {
    return Boolean(fallback && fallback !== primary);
  }

  private async generateAiveneText(input: {
    model: string;
    prompt: string;
    video?: UploadedAiFile | UploadedAiFile[];
  }): Promise<Record<string, unknown>> {
    const response = await fetch(resolveAiveneChatEndpoint(this.aiveneBaseUrl || DEFAULT_AIVENE_BASE_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.aiveneApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizeScriptModel(input.model, "aivene"),
        messages: [
          {
            role: "user",
            content: buildAiveneMessageContent(input.prompt, input.video)
          }
        ]
      })
    });

    const payload = parseErrorPayload(await response.text().catch(() => ""));
    if (!response.ok) {
      throwGatewayError(response, payload, `Aivene text request gagal (${response.status}).`);
    }
    return payload;
  }

  private async generateOpenRouterText(input: {
    model: string;
    prompt: string;
    video?: UploadedAiFile | UploadedAiFile[];
  }): Promise<Record<string, unknown>> {
    const response = await fetch(OPENROUTER_TEXT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openrouterApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizeScriptModel(input.model, "openrouter"),
        messages: [
          {
            role: "user",
            content: buildAiveneMessageContent(input.prompt, input.video)
          }
        ]
      })
    });

    const payload = parseErrorPayload(await response.text().catch(() => ""));
    if (!response.ok) {
      throwGatewayError(response, payload, `OpenRouter text request gagal (${response.status}).`);
    }
    return payload;
  }

  private async generateTextWithProvider(input: {
    provider: AiProvider;
    fallbackProvider?: AiProvider;
    model: string;
    prompt: string;
    video?: UploadedAiFile | UploadedAiFile[];
  }): Promise<Record<string, unknown>> {
    const runForProvider = async (provider: AiProvider): Promise<Record<string, unknown>> =>
      await withRetry(
        async () =>
          provider === "openrouter"
            ? await this.generateOpenRouterText(input)
            : await this.generateAiveneText(input),
        {
          attempts: 3,
          baseDelayMs: 700,
          shouldRetry: isTransientError,
          getDelayMs: retryDelayMs
        }
      );

    try {
      return await runForProvider(input.provider);
    } catch (primaryError) {
      if (!this.shouldUseFallbackProvider(input.provider, input.fallbackProvider)) {
        throw primaryError;
      }
      this.logger.warn(
        {
          err: primaryError,
          primaryProvider: input.provider,
          fallbackProvider: input.fallbackProvider
        },
        "Provider AI utama gagal, mencoba fallback provider."
      );
      return await runForProvider(input.fallbackProvider);
    }
  }

  private async generateAiveneSpeech(
    input: GenerateSpeechInput
  ): Promise<{ data: Buffer; mimeType: string }> {
    const response = await fetch(resolveAiveneSpeechEndpoint(this.aiveneBaseUrl || DEFAULT_AIVENE_BASE_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.aiveneApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizeTtsModel(input.model, "aivene"),
        input: normalizeSpeechText(input.text),
        voice: input.voiceName,
        response_format: "mp3",
        speed: input.speechRate
      })
    });

    if (!response.ok) {
      const payload = parseErrorPayload(await response.text().catch(() => ""));
      throwGatewayError(response, payload, `Aivene TTS request gagal (${response.status}).`);
    }

    return {
      data: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("Content-Type")?.trim() || "audio/mpeg"
    };
  }

  private async generateOpenRouterSpeech(
    input: GenerateSpeechInput
  ): Promise<{ data: Buffer; mimeType: string }> {
    const response = await fetch(OPENROUTER_TTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openrouterApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizeTtsModel(input.model, "openrouter"),
        input: normalizeSpeechText(input.text),
        voice: input.voiceName,
        response_format: "mp3",
        speed: input.speechRate
      })
    });

    if (!response.ok) {
      const payload = parseErrorPayload(await response.text().catch(() => ""));
      throwGatewayError(response, payload, `OpenRouter TTS request gagal (${response.status}).`);
    }

    return {
      data: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("Content-Type")?.trim() || "audio/mpeg"
    };
  }

  public async uploadVideo(filePath: string, mimeType: string): Promise<UploadedAiFile> {
    const data = await readFile(filePath);
    return {
      provider: "gemini",
      mimeType,
      base64Data: data.toString("base64")
    };
  }

  public async generateScript(input: GenerateScriptInput): Promise<string> {
    const run = async (prompt: string): Promise<string> => {
      const response = await this.generateTextWithProvider({
        provider: input.provider,
        fallbackProvider: input.fallbackProvider,
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
      script = await run(`${input.prompt}\n\nKembalikan hanya satu paragraf naskah final tanpa format markdown.`);
    }

    if (!script) {
      throw new Error("Layanan pemrosesan mengembalikan naskah kosong.");
    }
    return script;
  }

  public async generateVisualBrief(input: GenerateVisualBriefInput) {
    const run = async (prompt: string) => {
      const response = await this.generateTextWithProvider({
        provider: input.provider,
        fallbackProvider: input.fallbackProvider,
        model: input.model,
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

      this.logger.warn({ err: error }, "Visual brief tidak valid, mencoba ulang dengan strict JSON prompt.");
      return await execute(
        `${input.prompt}\n\nKembalikan hanya JSON valid sesuai struktur yang diminta, tanpa markdown dan tanpa teks tambahan.`
      );
    }
  }

  public async generateCaptionMetadata(
    input: GenerateCaptionMetadataInput
  ): Promise<{ caption: string; hashtags: string[] }> {
    const run = async (prompt: string): Promise<{ caption: string; hashtags: string[] }> => {
      const response = await this.generateTextWithProvider({
        provider: input.provider,
        fallbackProvider: input.fallbackProvider,
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
      social = await run(`${input.prompt}\n\nKembalikan hanya JSON valid tanpa markdown dan tanpa teks tambahan.`);
    }

    return social;
  }

  public async generateSpeech(input: GenerateSpeechInput): Promise<{ data: Buffer; mimeType: string }> {
    const runForProvider = async (provider: AiProvider) =>
      await withRetry(
        async () =>
          provider === "openrouter"
            ? await this.generateOpenRouterSpeech(input)
            : await this.generateAiveneSpeech(input),
        {
          attempts: 3,
          baseDelayMs: 700,
          shouldRetry: isTransientError,
          getDelayMs: retryDelayMs
        }
      );

    try {
      return await runForProvider(input.provider);
    } catch (primaryError) {
      if (!this.shouldUseFallbackProvider(input.provider, input.fallbackProvider)) {
        throw primaryError;
      }
      this.logger.warn(
        {
          err: primaryError,
          primaryProvider: input.provider,
          fallbackProvider: input.fallbackProvider
        },
        "Provider TTS utama gagal, mencoba fallback provider."
      );
      return await runForProvider(input.fallbackProvider);
    }
  }
}
