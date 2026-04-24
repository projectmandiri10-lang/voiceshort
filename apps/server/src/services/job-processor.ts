import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { JobRecord } from "../types.js";
import { SettingsStore } from "../stores/settings-store.js";
import { JobsStore } from "../stores/jobs-store.js";
import {
  GeminiService,
  InvalidGeminiStructuredOutputError
} from "./gemini-service.js";
import {
  buildCaptionPrompt,
  buildScriptPrompt,
  buildVisualBriefPrompt
} from "./prompt-builder.js";
import { OUTPUTS_DIR, outputUrlToAbsolutePath } from "../utils/paths.js";
import { combineVideoWithVoiceOver, writeWav24kMono } from "../utils/audio.js";
import { ensureSocialMetadata, formatSocialMetadataFile } from "../utils/model-output.js";

interface QueueItem {
  jobId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toOutputUrl(jobId: string, filename: string): string {
  return `/outputs/${jobId}/${encodeURIComponent(filename)}`;
}

function parseGeminiQuotaMessage(message: string): string | undefined {
  try {
    const payload = JSON.parse(message) as {
      error?: {
        code?: number;
        status?: string;
        details?: Array<Record<string, unknown>>;
      };
    };
    const status = payload.error?.status || "";
    const code = payload.error?.code || 0;
    if (!(status === "RESOURCE_EXHAUSTED" || code === 429)) {
      return undefined;
    }

    let retryDelay = "";
    for (const detail of payload.error?.details || []) {
      const detailType = String(detail["@type"] || "");
      if (detailType.includes("RetryInfo")) {
        retryDelay = String(detail["retryDelay"] || "").trim();
      }
    }

    const retryText = retryDelay ? ` Coba lagi dalam ${retryDelay}.` : "";
    return `Kuota Gemini habis untuk saat ini.${retryText} Cek billing/quota API key Anda atau tunggu reset kuota.`;
  } catch {
    return undefined;
  }
}

async function removeExistingArtifacts(job: JobRecord): Promise<void> {
  const outputUrls = new Set(
    [
    ...(job.output.artifactPaths || []),
    job.output.captionPath,
    job.output.scriptPath,
    job.output.voicePath,
    job.output.finalVideoPath
    ].filter((value): value is string => Boolean(value))
  );

  const paths = [...outputUrls]
    .map((url) => outputUrlToAbsolutePath(url))
    .filter((value): value is string => Boolean(value));

  await Promise.all(paths.map((filePath) => rm(filePath, { recursive: false, force: true })));
}

function buildFallbackHashtags(contentType: JobRecord["contentType"]): string[] {
  return [
    `#${contentType.replace(/[^\w]/g, "")}`.toLowerCase(),
    "#shorts",
    "#kontenindonesia",
    "#fyp"
  ];
}

export interface IJobProcessor {
  enqueue(jobId: string): void;
}

export class JobProcessor implements IJobProcessor {
  private readonly queue: QueueItem[] = [];
  private running = false;
  private idleResolvers: Array<() => void> = [];

  public constructor(
    private readonly jobsStore: JobsStore,
    private readonly settingsStore: SettingsStore,
    private readonly gemini: GeminiService,
    private readonly logger: FastifyBaseLogger
  ) {}

  public enqueue(jobId: string): void {
    this.queue.push({ jobId });
    void this.consume();
  }

  public async whenIdle(): Promise<void> {
    if (!this.running && this.queue.length === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private resolveIdle(): void {
    if (this.running || this.queue.length > 0) {
      return;
    }
    for (const resolve of this.idleResolvers.splice(0)) {
      resolve();
    }
  }

  private async consume(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        break;
      }

      try {
        await this.processItem(item);
      } catch (error) {
        this.logger.error({ err: error, jobId: item.jobId }, "Processing job gagal.");
      }
    }
    this.running = false;
    this.resolveIdle();
  }

  private async processItem(item: QueueItem): Promise<void> {
    const job = await this.jobsStore.getById(item.jobId);
    if (!job) {
      return;
    }

    const settings = await this.settingsStore.get();
    await this.jobsStore.update(item.jobId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      status: "running",
      errorMessage: undefined,
      output: {
        ...current.output,
        updatedAt: nowIso()
      }
    }));

    let uploadedVideo;
    try {
      uploadedVideo = await this.gemini.uploadVideo(job.videoPath, job.videoMimeType);
    } catch (error) {
      await this.failJob(item.jobId, this.toErrorMessage(error));
      return;
    }

    const outputDir = path.join(OUTPUTS_DIR, job.jobId);
    const captionFilename = "caption.txt";
    const finalFilename = "final.mp4";
    const captionPath = path.join(outputDir, captionFilename);
    const finalPath = path.join(outputDir, finalFilename);
    const attemptOutputPaths = [captionPath, finalPath];
    let voiceTempDir = "";

    try {
      await removeExistingArtifacts(job);
      await rm(outputDir, { recursive: true, force: true });
      await mkdir(outputDir, { recursive: true });
      voiceTempDir = await mkdtemp(path.join(os.tmpdir(), `voice-shorts-${job.jobId}-`));
      const voicePath = path.join(voiceTempDir, "voice.wav");

      const promptInput = {
        settings,
        title: job.title,
        description: job.description,
        contentType: job.contentType,
        voiceGender: job.voiceGender,
        tone: job.tone,
        videoDurationSec: job.videoDurationSec,
        ctaText: job.ctaText,
        referenceLink: job.referenceLink
      };

      let scriptText = "";
      let rawSocialMetadata = { caption: "", hashtags: [] as string[] };
      try {
        const visualBriefPrompt = buildVisualBriefPrompt(promptInput);
        const visualBrief = await this.gemini.generateVisualBrief({
          model: settings.scriptModel,
          prompt: visualBriefPrompt,
          video: uploadedVideo
        });

        const scriptPrompt = buildScriptPrompt({
          ...promptInput,
          visualBrief
        });
        scriptText = await this.gemini.generateScript({
          model: settings.scriptModel,
          prompt: scriptPrompt
        });

        const captionPrompt = buildCaptionPrompt({
          ...promptInput,
          scriptText,
          visualBrief
        });
        rawSocialMetadata = await this.gemini.generateCaptionMetadata({
          model: settings.scriptModel,
          prompt: captionPrompt
        });
      } catch (error) {
        if (!(error instanceof InvalidGeminiStructuredOutputError)) {
          throw error;
        }

        this.logger.warn(
          { err: error, jobId: item.jobId },
          "Visual brief tidak valid, memakai fallback multimodal langsung."
        );

        const scriptPrompt = buildScriptPrompt(promptInput);
        scriptText = await this.gemini.generateScript({
          model: settings.scriptModel,
          prompt: scriptPrompt,
          video: uploadedVideo
        });

        const captionPrompt = buildCaptionPrompt({
          ...promptInput,
          scriptText
        });
        rawSocialMetadata = await this.gemini.generateCaptionMetadata({
          model: settings.scriptModel,
          prompt: captionPrompt,
          video: uploadedVideo
        });
      }

      const socialMetadata = ensureSocialMetadata(
        rawSocialMetadata,
        scriptText,
        buildFallbackHashtags(job.contentType)
      );
      await writeFile(captionPath, formatSocialMetadataFile(socialMetadata), "utf8");

      const voiceProfile = await this.settingsStore.getVoiceForGender(job.voiceGender);
      const audio = await this.gemini.generateSpeech({
        model: settings.ttsModel,
        text: scriptText,
        voiceName: voiceProfile.voiceName,
        speechRate: voiceProfile.speechRate
      });
      await writeWav24kMono(audio.data, audio.mimeType, voicePath, voiceProfile.speechRate);
      await combineVideoWithVoiceOver(job.videoPath, voicePath, finalPath, job.videoDurationSec);
      await rm(voiceTempDir, { recursive: true, force: true });
      voiceTempDir = "";

      const artifactUrls = [
        toOutputUrl(job.jobId, captionFilename),
        toOutputUrl(job.jobId, finalFilename)
      ];

      await this.jobsStore.update(item.jobId, (current) => ({
        ...current,
        updatedAt: nowIso(),
        status: "success",
        errorMessage: undefined,
        output: {
          captionPath: artifactUrls[0],
          scriptPath: undefined,
          voicePath: undefined,
          finalVideoPath: artifactUrls[1],
          artifactPaths: artifactUrls,
          updatedAt: nowIso()
        }
      }));
    } catch (error) {
      await Promise.all(
        attemptOutputPaths.map((outputPath) => rm(outputPath, { recursive: false, force: true }))
      );
      if (voiceTempDir) {
        await rm(voiceTempDir, { recursive: true, force: true });
      }
      await this.failJob(item.jobId, this.toErrorMessage(error));
      this.logger.error({ err: error, jobId: item.jobId }, "General job processing gagal.");
    }
  }

  private async failJob(jobId: string, message: string): Promise<void> {
    await this.jobsStore.update(jobId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      status: "failed",
      errorMessage: message,
      output: {
        captionPath: undefined,
        scriptPath: undefined,
        voicePath: undefined,
        finalVideoPath: undefined,
        artifactPaths: [],
        updatedAt: nowIso()
      }
    }));
  }

  private toErrorMessage(error: unknown): string {
    const message =
      (error as { message?: string })?.message || "Terjadi error saat memproses job.";
    return parseGeminiQuotaMessage(message) || message;
  }
}
