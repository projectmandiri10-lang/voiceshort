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
  extractScriptText,
  extractSocialMetadata,
  extractVisualBrief
} from "../utils/model-output.js";
import {
  fetchOpenAiCompatible,
  getOpenAiCompatibleUploadTimeoutMs,
  buildOpenAiCompatibleUserContent,
  isOpenAiCompatibleTransientError,
  normalizeOpenAiCompatibleBaseUrl,
  openAiCompatibleRetryDelayMs,
  parseOpenAiCompatibleJsonResponse
} from "./openai-compatible.js";

interface LiteLlmServiceOptions {
  baseUrl: string;
  apiKey: string;
  scriptModel?: string;
  ttsModel: string;
  fileTargetModel?: string;
  logger: FastifyBaseLogger;
}

const LEGACY_GEMINI_TTS_MODEL_ALIASES: Record<string, string> = {
  "gemini-2.5-flash-preview-tts": "vertex_ai/gemini-2.5-flash-tts",
  "gemini/gemini-2.5-flash-preview-tts": "vertex_ai/gemini-2.5-flash-tts",
  "gemini-2.5-flash-tts": "vertex_ai/gemini-2.5-flash-tts",
  "gemini/gemini-2.5-flash-tts": "vertex_ai/gemini-2.5-flash-tts",
  "gemini-2.5-pro-preview-tts": "vertex_ai/gemini-2.5-pro-tts",
  "gemini/gemini-2.5-pro-preview-tts": "vertex_ai/gemini-2.5-pro-tts",
  "gemini-2.5-pro-tts": "vertex_ai/gemini-2.5-pro-tts",
  "gemini/gemini-2.5-pro-tts": "vertex_ai/gemini-2.5-pro-tts",
  "gemini-2.5-flash-lite-preview-tts": "vertex_ai/gemini-2.5-flash-lite-preview-tts",
  "gemini/gemini-2.5-flash-lite-preview-tts":
    "vertex_ai/gemini-2.5-flash-lite-preview-tts"
};

function buildLiteLlmTtsInstructions(input: GenerateSpeechInput): string {
  const paceInstruction =
    input.speechRate >= 1.1
      ? "Pace: sedikit cepat, tetap jelas dan tidak terburu-buru."
      : input.speechRate <= 0.9
        ? "Pace: sedikit lebih pelan, tetap natural dan tidak datar."
        : "Pace: natural untuk voice over video pendek.";

  const deliveryInstruction = input.deliveryHint?.trim()
    ? `Nuansa tambahan: ${input.deliveryHint.trim()}.`
    : "Nuansa tambahan: natural, jelas, dan enak didengar untuk penonton Indonesia.";

  return [
    "Narator voice over video berbahasa Indonesia.",
    "Language: Bahasa Indonesia (id-ID).",
    "Accent: penutur asli Indonesia, natural, jelas, dan tidak kaku.",
    "Style: realistis, hangat, dan cocok untuk voice over video pendek.",
    paceInstruction,
    deliveryInstruction,
    "Pronunciation: utamakan pelafalan kata Indonesia secara lokal, bukan aksen Inggris atau suara robotik."
  ].join("\n");
}

export function normalizeLiteLlmTtsModel(model: string): string {
  const cleanModel = model.trim();
  return LEGACY_GEMINI_TTS_MODEL_ALIASES[cleanModel] ?? cleanModel;
}

export class LiteLlmService implements AiService {
  public readonly appliesSpeechRateNatively = true;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly scriptModel: string;
  private readonly ttsModel: string;
  private readonly fileTargetModel: string;
  private readonly logger: FastifyBaseLogger;

  public constructor(options: LiteLlmServiceOptions) {
    this.baseUrl = normalizeOpenAiCompatibleBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey.trim();
    this.scriptModel = options.scriptModel?.trim() || "";
    this.ttsModel = options.ttsModel.trim();
    this.fileTargetModel = options.fileTargetModel?.trim() || this.scriptModel;
    this.logger = options.logger;
  }

  private requireScriptModel(): string {
    if (!this.scriptModel) {
      throw new Error("LiteLLM script model belum dikonfigurasi.");
    }
    return this.scriptModel;
  }

  private requireFileTargetModel(): string {
    if (!this.fileTargetModel) {
      throw new Error("LiteLLM file target model belum dikonfigurasi.");
    }
    return this.fileTargetModel;
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
    return await parseOpenAiCompatibleJsonResponse(response, "LiteLLM");
  }

  private async requestJson(pathname: string, body: unknown): Promise<unknown> {
    const response = await fetchOpenAiCompatible(
      `${this.baseUrl}${pathname}`,
      {
        method: "POST",
        headers: this.buildHeaders(true),
        body: JSON.stringify(body)
      },
      {
        providerName: "LiteLLM"
      }
    );
    return await this.parseJsonResponse(response);
  }

  private async generateUserContent(input: {
    model: string;
    prompt: string;
    video?: UploadedAiFile | UploadedAiFile[];
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
        form.append("target_model_names", this.requireFileTargetModel());
        form.append(
          "file",
          new Blob([fileBuffer], { type: mimeType }),
          path.basename(filePath)
        );

        const response = await fetchOpenAiCompatible(
          `${this.baseUrl}/v1/files`,
          {
            method: "POST",
            headers: this.buildHeaders(false),
            body: form
          },
          {
            providerName: "LiteLLM",
            timeoutMs: getOpenAiCompatibleUploadTimeoutMs()
          }
        );
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
        shouldRetry: isOpenAiCompatibleTransientError,
        getDelayMs: openAiCompatibleRetryDelayMs
      }
    );
  }

  public async generateScript(input: GenerateScriptInput): Promise<string> {
    const execute = async (prompt: string) => {
      const response = await this.generateUserContent({
        model: input.model || this.requireScriptModel(),
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
        model: input.model || this.requireScriptModel(),
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
        model: input.model || this.requireScriptModel(),
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
      const resolvedModel = normalizeLiteLlmTtsModel(input.model || this.ttsModel);
      const response = await fetchOpenAiCompatible(
        `${this.baseUrl}/v1/audio/speech`,
        {
          method: "POST",
          headers: this.buildHeaders(true),
          body: JSON.stringify({
            model: resolvedModel,
            voice: input.voiceName,
            input: input.text,
            instructions: buildLiteLlmTtsInstructions(input),
            response_format: "wav",
            speed: input.speechRate
          })
        },
        {
          providerName: "LiteLLM"
        }
      );

      if (!response.ok) {
        await this.parseJsonResponse(response);
        throw new Error("LiteLLM TTS gagal tanpa detail error.");
      }

      const audio = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get("content-type")?.split(";")[0] || "audio/wav";
      return {
        data: audio,
        mimeType
      };
    };

    try {
      return await withRetry(execute, {
        attempts: 3,
        baseDelayMs: 700,
        shouldRetry: isOpenAiCompatibleTransientError,
        getDelayMs: openAiCompatibleRetryDelayMs
      });
    } catch (error) {
      const message = String((error as { message?: string })?.message || "");
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 400 && /invalid model/i.test(message)) {
        throw new Error(
          `${message} Gunakan model TTS LiteLLM yang aktif di /v1/models, misalnya vertex_ai/gemini-2.5-flash-tts.`
        );
      }
      throw error;
    }
  }
}
