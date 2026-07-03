import { GoogleGenAI } from "@google/genai";
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
import { normalizeScriptModel, normalizeTtsModel } from "../constants.js";
import {
  extractScriptText,
  extractSocialMetadata,
  extractVisualBrief
} from "../utils/model-output.js";

export { InvalidGeminiStructuredOutputError } from "./ai-service.js";

const FILE_READY_POLL_INTERVAL_MS = 2000;
const FILE_READY_MAX_ATTEMPTS = 30;
const MAX_RETRY_DELAY_MS = 60_000;
const OPENROUTER_TEXT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TTS_ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";
const DEFAULT_OPENROUTER_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";

interface ParsedGeminiApiError {
  code?: number;
  status?: string;
  retryDelayMs?: number;
  quotaId?: string;
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

  const statusFromError = Number((error as { status?: number })?.status);
  if (Number.isFinite(statusFromError) && statusFromError > 0 && !parsed.code) {
    parsed.code = statusFromError;
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
    (typeof parsed.code === "number" && parsed.code >= 500) ||
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

function normalizeOpenRouterTtsModel(model: string): string {
  return normalizeTtsModel(model, "openrouter") || DEFAULT_OPENROUTER_TTS_MODEL;
}

function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildGeminiTtsPrompt(input: {
  text: string;
  speechRate: number;
  contentLanguage?: "id-ID" | "en-US";
  deliveryHint?: string;
}): string {
  const contentLanguage = input.contentLanguage === "en-US" ? "en-US" : "id-ID";
  if (contentLanguage === "en-US") {
    const paceInstruction =
      input.speechRate >= 1.1
        ? "Pace: slightly faster, still clear and never rushed."
        : input.speechRate <= 0.9
          ? "Pace: slightly slower, still natural and not flat."
          : "Pace: natural for short-form voice over.";
    const deliveryInstruction = input.deliveryHint?.trim()
      ? `Additional nuance: ${input.deliveryHint.trim()}.`
      : "Additional nuance: natural, clear, warm, and comfortable for English-speaking short-form viewers.";

    return [
      "You are a short-form video voice over narrator.",
      "Language: English (en-US).",
      "Accent: neutral, natural, and easy to understand.",
      "Style: realistic, warm, and suitable for social video voice over.",
      paceInstruction,
      deliveryInstruction,
      "Pronunciation: prioritize natural spoken English instead of robotic delivery.",
      "Read the following text exactly as written without adding extra words:",
      "",
      input.text
    ].join("\n");
  }

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
    "Pronunciation: utamakan pelafalan kata Indonesia secara lokal, bukan aksen Inggris atau suara robotik.",
    "Bacakan teks berikut persis apa adanya tanpa menambah kalimat lain:",
    "",
    input.text
  ].join("\n");
}

export class GeminiService implements AiService {
  private readonly client: GoogleGenAI;
  public readonly appliesSpeechRateNatively = false;

  public constructor(
    geminiApiKey: string,
    private readonly openrouterApiKey: string,
    private readonly logger: FastifyBaseLogger
  ) {
    this.client = new GoogleGenAI({ apiKey: geminiApiKey });
    if (!this.openrouterApiKey.trim()) {
      throw new Error("OPENROUTER_API_KEY wajib diisi.");
    }
  }

  private buildUserParts(prompt: string, video?: UploadedAiFile | UploadedAiFile[]) {
    const files = Array.isArray(video) ? video : (video ? [video] : []);
    if (files.length === 0) {
      return [{ text: prompt }];
    }

    const fileParts = files.map((file) => {
      if (file.base64Data) {
        return {
          inlineData: {
            data: file.base64Data,
            mimeType: file.mimeType
          }
        };
      }
      if (!file.fileUri) {
        throw new Error("Referensi file Gemini tidak memiliki fileUri atau base64Data.");
      }
      return {
        fileData: {
          fileUri: file.fileUri,
          mimeType: file.mimeType
        }
      };
    });

    return [...fileParts, { text: prompt }];
  }

  private async generateUserContent(input: {
    model: string;
    prompt: string;
    video?: UploadedAiFile | UploadedAiFile[];
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

  private shouldUseFallbackProvider(
    primary: AiProvider,
    fallback: AiProvider | undefined
  ): fallback is AiProvider {
    return Boolean(fallback && fallback !== primary);
  }

  private openRouterPayloadToGeminiLike(payload: Record<string, unknown>): Record<string, unknown> {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    const rawContent = first?.message?.content;
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) => {
                if (!part || typeof part !== "object" || Array.isArray(part)) {
                  return "";
                }
                const value = (part as { text?: unknown }).text;
                return typeof value === "string" ? value : "";
              })
              .filter(Boolean)
              .join("\n")
          : "";

    return {
      candidates: [
        {
          content: {
            parts: [{ text }]
          }
        }
      ]
    };
  }

  private buildOpenRouterMessageContent(prompt: string, video?: UploadedAiFile | UploadedAiFile[]) {
    const files = Array.isArray(video) ? video : video ? [video] : [];
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const file of files) {
      if (!file.base64Data) {
        throw new Error("OpenRouter multimodal memerlukan frame base64, bukan fileUri Gemini.");
      }
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${file.mimeType};base64,${file.base64Data}`
        }
      });
    }
    return content;
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
            content: this.buildOpenRouterMessageContent(input.prompt, input.video)
          }
        ]
      })
    });

    const text = await response.text().catch(() => "");
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      const message =
        String((payload.error as { message?: unknown } | undefined)?.message || payload.message || "").trim() ||
        `OpenRouter text request gagal (${response.status}).`;
      throw Object.assign(new Error(message), {
        status: response.status === 429 ? 503 : response.status,
        details: payload
      });
    }

    return this.openRouterPayloadToGeminiLike(payload);
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
            : ((await this.generateUserContent({
                model: normalizeScriptModel(input.model, "gemini_direct"),
                prompt: input.prompt,
                video: input.video
              })) as unknown as Record<string, unknown>),
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
        model: normalizeOpenRouterTtsModel(input.model),
        input: normalizeSpeechText(input.text),
        voice: input.voiceName,
        response_format: "mp3",
        speed: input.speechRate
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let payload: Record<string, unknown> = {};
      if (text) {
        try {
          payload = JSON.parse(text) as Record<string, unknown>;
        } catch {
          payload = { message: text };
        }
      }
      const message =
        String((payload.error as { message?: unknown } | undefined)?.message || payload.message || "").trim() ||
        `OpenRouter TTS request gagal (${response.status}).`;
      throw Object.assign(new Error(message), {
        status: response.status === 429 ? 503 : response.status,
        details: payload
      });
    }

    const data = Buffer.from(await response.arrayBuffer());
    return {
      data,
      mimeType: response.headers.get("Content-Type")?.trim() || "audio/mpeg"
    };
  }

  private extractGeminiAudioFromResponse(response: unknown): { data: Buffer; mimeType: string } {
    const parts =
      ((response as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> })
        ?.candidates?.[0]?.content?.parts || []) as Array<Record<string, unknown>>;

    for (const part of parts) {
      const inlineData = part.inlineData as { data?: unknown; mimeType?: unknown } | undefined;
      const rawData = inlineData?.data;
      if (rawData instanceof Uint8Array) {
        return {
          data: Buffer.from(rawData),
          mimeType:
            typeof inlineData?.mimeType === "string" && inlineData.mimeType.trim()
              ? inlineData.mimeType.trim()
              : "audio/wav"
        };
      }
      if (typeof rawData === "string" && rawData.trim()) {
        return {
          data: Buffer.from(rawData.trim(), "base64"),
          mimeType:
            typeof inlineData?.mimeType === "string" && inlineData.mimeType.trim()
              ? inlineData.mimeType.trim()
              : "audio/wav"
        };
      }
      if (Array.isArray(rawData) && rawData.length) {
        return {
          data: Buffer.from(rawData),
          mimeType:
            typeof inlineData?.mimeType === "string" && inlineData.mimeType.trim()
              ? inlineData.mimeType.trim()
              : "audio/wav"
        };
      }
    }

    throw new Error("Gemini direct tidak mengembalikan audio.");
  }

  private async generateGeminiDirectSpeech(
    input: GenerateSpeechInput
  ): Promise<{ data: Buffer; mimeType: string }> {
    const response = await this.client.models.generateContent({
      model: normalizeTtsModel(input.model, "gemini_direct"),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildGeminiTtsPrompt({
                text: input.text,
                speechRate: input.speechRate,
                contentLanguage: input.contentLanguage,
                deliveryHint: input.deliveryHint
              })
            }
          ]
        }
      ],
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

    return this.extractGeminiAudioFromResponse(response);
  }

  public async uploadVideo(
    filePath: string,
    mimeType: string
  ): Promise<UploadedAiFile> {
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
      throw new Error("Upload video gagal: URI tidak tersedia.");
    }

    await this.waitUntilFileActive(uploaded.name);

    return {
      provider: "gemini",
      fileUri: uploaded.uri,
      mimeType: uploaded.mimeType
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
      script = await run(
        `${input.prompt}\n\nKembalikan hanya satu paragraf naskah final tanpa format markdown.`
      );
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
      social = await run(
        `${input.prompt}\n\nKembalikan hanya JSON valid tanpa markdown dan tanpa teks tambahan.`
      );
    }

    return social;
  }

  public async generateSpeech(
    input: GenerateSpeechInput
  ): Promise<{ data: Buffer; mimeType: string }> {
    const runForProvider = async (provider: AiProvider) =>
      await withRetry(
        async () =>
          provider === "openrouter"
            ? await this.generateOpenRouterSpeech(input)
            : await this.generateGeminiDirectSpeech(input),
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

  private async waitUntilFileActive(fileName: string): Promise<void> {
    let lastState = "unknown";
    for (let attempt = 1; attempt <= FILE_READY_MAX_ATTEMPTS; attempt += 1) {
      const file = await this.client.files.get({ name: fileName });
      lastState = file.state || "unknown";

      if (file.state === "ACTIVE") {
        return;
      }

      if (file.state === "FAILED") {
        const reason = file.error?.message || "Pemrosesan file gagal.";
        throw new Error(`Upload video gagal diproses: ${reason}`);
      }

      this.logger.debug(
        { fileName, attempt, state: file.state },
        "Menunggu file upload menjadi ACTIVE."
      );

      await sleep(FILE_READY_POLL_INTERVAL_MS);
    }

    throw new Error(
      `File upload belum ACTIVE setelah ${
        FILE_READY_MAX_ATTEMPTS * FILE_READY_POLL_INTERVAL_MS
      } ms (state terakhir: ${lastState}).`
    );
  }
}
