import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { ContentAiService } from "./ai-service.js";
import { InvalidGeminiStructuredOutputError } from "./ai-service.js";
import type {
  GenerateCaptionMetadataInput,
  GenerateScriptInput,
  GenerateVisualBriefInput,
  UploadedAiFile
} from "../types.js";
import { withRetry } from "../utils/retry.js";
import {
  extractScriptText,
  extractSocialMetadata,
  extractVisualBrief
} from "../utils/model-output.js";
import {
  buildOpenAiCompatibleUserContent,
  isOpenAiCompatibleTransientError,
  normalizeOpenAiCompatibleBaseUrl,
  openAiCompatibleRetryDelayMs,
  parseOpenAiCompatibleJsonResponse
} from "./openai-compatible.js";

interface SnifoxServiceOptions {
  baseUrl: string;
  apiKey: string;
  scriptModel: string;
  logger: FastifyBaseLogger;
}

export class SnifoxService implements ContentAiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly scriptModel: string;
  private readonly logger: FastifyBaseLogger;

  public constructor(options: SnifoxServiceOptions) {
    this.baseUrl = normalizeOpenAiCompatibleBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey.trim();
    this.scriptModel = options.scriptModel.trim();
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

  private async parseJsonResponse(response: Response): Promise<unknown> {
    return await parseOpenAiCompatibleJsonResponse(response, "Snifox");
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
          content: buildOpenAiCompatibleUserContent(input.prompt, input.video)
        }
      ]
    });
  }

  public async uploadVideo(filePath: string, mimeType: string): Promise<UploadedAiFile> {
    return await withRetry(
      async () => {
        const fileBuffer = await readFile(filePath);
        const form = new FormData();
        form.append("purpose", "user_data");
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
          throw new Error("Upload video ke Snifox gagal: file id tidak tersedia.");
        }

        return {
          provider: "snifox",
          fileId: parsed.id,
          mimeType
        };
      },
      {
        attempts: 3,
        baseDelayMs: 700,
        shouldRetry: isOpenAiCompatibleTransientError,
        getDelayMs: openAiCompatibleRetryDelayMs
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
      shouldRetry: isOpenAiCompatibleTransientError,
      getDelayMs: openAiCompatibleRetryDelayMs
    });

    if (!script) {
      this.logger.warn("Script kosong dari Snifox, mencoba ulang dengan strict prompt.");
      script = await execute(
        `${input.prompt}\n\nKembalikan hanya satu paragraf naskah final tanpa format markdown.`
      );
    }

    if (!script) {
      throw new Error("Layanan Snifox mengembalikan naskah kosong.");
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
        shouldRetry: isOpenAiCompatibleTransientError,
        getDelayMs: openAiCompatibleRetryDelayMs
      });

    try {
      return await execute(input.prompt);
    } catch (error) {
      if (!(error instanceof InvalidGeminiStructuredOutputError)) {
        throw error;
      }

      this.logger.warn(
        { err: error },
        "Visual brief Snifox tidak valid, mencoba ulang dengan strict JSON prompt."
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
      shouldRetry: isOpenAiCompatibleTransientError,
      getDelayMs: openAiCompatibleRetryDelayMs
    });

    if (!social.caption && social.hashtags.length === 0) {
      this.logger.warn("Caption Snifox kosong, mencoba ulang dengan strict prompt.");
      social = await execute(
        `${input.prompt}\n\nKembalikan hanya JSON valid tanpa markdown dan tanpa teks tambahan.`
      );
    }

    return social;
  }
}
