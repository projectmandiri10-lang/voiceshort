import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { GenerationCapacity, JobRecord, UploadedAiFile, VisualBrief } from "../types.js";
import { SettingsStore } from "../stores/settings-store.js";
import { JobsStore } from "../stores/jobs-store.js";
import { JobEvents } from "./job-events.js";
import type { AiService, SpeechService } from "./ai-service.js";
import { InvalidGeminiStructuredOutputError } from "./ai-service.js";
import {
  buildCaptionPrompt,
  buildScriptPrompt,
  buildScriptRetimingPrompt,
  buildVisualBriefPrompt
} from "./prompt-builder.js";
import { OUTPUTS_DIR, UPLOADS_DIR, outputUrlToAbsolutePath } from "../utils/paths.js";
import { combineVideoWithVoiceOver, writeWav24kMono } from "../utils/audio.js";
import { buildJobProgress } from "../utils/job-progress.js";
import { ensureSocialMetadata, formatSocialMetadataFile } from "../utils/model-output.js";
import { probeVideoDuration } from "../utils/video.js";
import {
  calculateAdjustedSpeechRate,
  countWords,
  isVoiceDurationAligned
} from "../utils/voice-timing.js";

interface QueueItem {
  jobId: string;
  ownerKey?: string;
}

interface EnqueueOptions {
  ignoreCapacity?: boolean;
}

type VoiceAlignmentPromptInput = Parameters<typeof buildVisualBriefPrompt>[0];

export const JOB_PROCESSOR_LIMITS = {
  maxRunningJobs: 3,
  maxQueuedJobs: 20,
  maxRunningPerUser: 1
} as const;

export const SERVER_OVERLOAD_MESSAGE =
  "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi.";

const MAX_SCRIPT_ALIGNMENT_ATTEMPTS = 2;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeOwnerKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function toOutputUrl(jobId: string, filename: string): string {
  return `/outputs/${jobId}/${encodeURIComponent(filename)}`;
}

function getJobOwnerKey(job: Pick<JobRecord, "jobId" | "ownerUserId" | "ownerEmail">): string {
  return normalizeOwnerKey(job.ownerUserId) || normalizeOwnerKey(job.ownerEmail) || `job:${job.jobId}`;
}

function buildCapacityMessage(overloaded: boolean): string {
  return overloaded ? SERVER_OVERLOAD_MESSAGE : "Server siap menerima job baru.";
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
    return `Kuota layanan pemrosesan habis untuk saat ini.${retryText} Cek konfigurasi server atau tunggu reset kuota.`;
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

async function cleanupSuccessfulUpload(jobId: string, logger: FastifyBaseLogger): Promise<void> {
  try {
    await rm(path.join(UPLOADS_DIR, jobId), { recursive: true, force: true });
  } catch (error) {
    logger.warn({ err: error, jobId }, "Gagal menghapus upload mentah setelah job sukses.");
  }
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
  enqueue(jobId: string, ownerKey?: string, options?: EnqueueOptions): boolean;
  getCapacitySnapshot(): GenerationCapacity;
  removeQueuedJob(jobId: string): void;
}

export class JobProcessor implements IJobProcessor {
  private readonly queue: QueueItem[] = [];
  private readonly queuedJobIds = new Set<string>();
  private readonly activeJobIds = new Set<string>();
  private readonly activeOwnerKeys = new Set<string>();
  private idleResolvers: Array<() => void> = [];
  private draining = false;
  private drainRequested = false;

  private readonly speechService: SpeechService;

  public constructor(
    private readonly jobsStore: JobsStore,
    private readonly settingsStore: SettingsStore,
    private readonly aiService: AiService,
    private readonly logger: FastifyBaseLogger,
    private readonly jobEvents: JobEvents,
    speechService?: SpeechService
  ) {
    this.speechService = speechService ?? aiService;
  }

  public enqueue(jobId: string, ownerKey?: string, options: EnqueueOptions = {}): boolean {
    if (this.queuedJobIds.has(jobId) || this.activeJobIds.has(jobId)) {
      return true;
    }
    if (!options.ignoreCapacity && this.queue.length >= JOB_PROCESSOR_LIMITS.maxQueuedJobs) {
      return false;
    }

    this.queue.push({
      jobId,
      ownerKey: normalizeOwnerKey(ownerKey)
    });
    this.queuedJobIds.add(jobId);
    void this.consume();
    return true;
  }

  public getCapacitySnapshot(): GenerationCapacity {
    const overloaded = this.queue.length >= JOB_PROCESSOR_LIMITS.maxQueuedJobs;
    return {
      overloaded,
      runningCount: this.activeJobIds.size,
      queuedCount: this.queue.length,
      maxRunningJobs: JOB_PROCESSOR_LIMITS.maxRunningJobs,
      maxQueuedJobs: JOB_PROCESSOR_LIMITS.maxQueuedJobs,
      maxRunningPerUser: JOB_PROCESSOR_LIMITS.maxRunningPerUser,
      message: buildCapacityMessage(overloaded)
    };
  }

  public removeQueuedJob(jobId: string): void {
    const index = this.queue.findIndex((item) => item.jobId === jobId);
    if (index < 0) {
      return;
    }
    this.queue.splice(index, 1);
    this.queuedJobIds.delete(jobId);
    this.resolveIdle();
  }

  public async hydrateQueuedJobs(): Promise<void> {
    const queuedJobs = (await this.jobsStore.list())
      .filter((job) => job.status === "queued")
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

    for (const job of queuedJobs) {
      this.enqueue(job.jobId, getJobOwnerKey(job), {
        ignoreCapacity: true
      });
    }
  }

  public async whenIdle(): Promise<void> {
    if (!this.draining && this.activeJobIds.size === 0 && this.queue.length === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private async synthesizeVoiceAlignedToVideo(input: {
    jobId: string;
    promptInput: VoiceAlignmentPromptInput;
    scriptText: string;
    visualBrief?: VisualBrief;
    uploadedVideo: UploadedAiFile[];
    voicePath: string;
    scriptModel: string;
    ttsModel: string;
    voiceName: string;
    speechRate: number;
    deliveryHint: string;
  }): Promise<string> {
    const providerAppliesSpeechRate = Boolean(this.speechService.appliesSpeechRateNatively);
    const baseLocalSpeechRate = providerAppliesSpeechRate ? 1 : input.speechRate;
    let currentScriptText = input.scriptText.trim();

    for (let attempt = 1; attempt <= MAX_SCRIPT_ALIGNMENT_ATTEMPTS; attempt += 1) {
      const audio = await this.speechService.generateSpeech({
        model: input.ttsModel,
        text: currentScriptText,
        voiceName: input.voiceName,
        speechRate: input.speechRate,
        deliveryHint: input.deliveryHint
      });
      await writeWav24kMono(audio.data, audio.mimeType, input.voicePath, baseLocalSpeechRate);
      let voiceDurationSec = await probeVideoDuration(input.voicePath);

      this.logger.info(
        {
          jobId: input.jobId,
          attempt,
          voiceDurationSec,
          targetDurationSec: input.promptInput.videoDurationSec,
          wordCount: countWords(currentScriptText)
        },
        "Voice over selesai disintesis, mengecek kesesuaian durasi."
      );

      if (isVoiceDurationAligned(voiceDurationSec, input.promptInput.videoDurationSec)) {
        return currentScriptText;
      }

      const adjustedSpeechRate = calculateAdjustedSpeechRate({
        currentDurationSec: voiceDurationSec,
        targetDurationSec: input.promptInput.videoDurationSec,
        currentSpeechRate: baseLocalSpeechRate
      });

      if (adjustedSpeechRate !== undefined) {
        await writeWav24kMono(audio.data, audio.mimeType, input.voicePath, adjustedSpeechRate);
        voiceDurationSec = await probeVideoDuration(input.voicePath);
        this.logger.info(
          {
            jobId: input.jobId,
            attempt,
            adjustedSpeechRate,
            voiceDurationSec,
            targetDurationSec: input.promptInput.videoDurationSec
          },
          "Menerapkan koreksi tempo lokal kecil untuk merapikan durasi voice over."
        );
        if (isVoiceDurationAligned(voiceDurationSec, input.promptInput.videoDurationSec)) {
          return currentScriptText;
        }
      }

      if (attempt >= MAX_SCRIPT_ALIGNMENT_ATTEMPTS) {
        return currentScriptText;
      }

      const retimingPrompt = buildScriptRetimingPrompt({
        ...input.promptInput,
        visualBrief: input.visualBrief,
        currentScriptText,
        actualDurationSec: voiceDurationSec
      });
      this.logger.info(
        {
          jobId: input.jobId,
          attempt,
          actualDurationSec: voiceDurationSec,
          targetDurationSec: input.promptInput.videoDurationSec
        },
        "Durasi voice over masih meleset, menyusun revisi script yang lebih presisi."
      );
      currentScriptText = await this.aiService.generateScript({
        model: input.scriptModel,
        prompt: retimingPrompt,
        video: input.visualBrief ? undefined : input.uploadedVideo
      });
    }

    return currentScriptText;
  }

  private resolveIdle(): void {
    if (this.draining || this.activeJobIds.size > 0 || this.queue.length > 0) {
      return;
    }
    for (const resolve of this.idleResolvers.splice(0)) {
      resolve();
    }
  }

  private async updateJob(jobId: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord | undefined> {
    const updated = await this.jobsStore.update(jobId, updater);
    if (updated) {
      this.jobEvents.publish(updated);
    }
    return updated;
  }

  private async setJobProgress(
    jobId: string,
    phase: "analyzing" | "scripting" | "captioning" | "synthesizing" | "rendering"
  ): Promise<void> {
    await this.updateJob(jobId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      status: "running",
      progress: buildJobProgress(phase),
      output: {
        ...current.output,
        updatedAt: nowIso()
      }
    }));
  }

  private async consume(): Promise<void> {
    if (this.draining) {
      this.drainRequested = true;
      return;
    }

    this.draining = true;
    try {
      do {
        this.drainRequested = false;
        while (this.activeJobIds.size < JOB_PROCESSOR_LIMITS.maxRunningJobs) {
          const item = await this.takeNextRunnableItem();
          if (!item) {
            break;
          }
          this.startItem(item);
        }
      } while (this.drainRequested);
    } finally {
      this.draining = false;
      this.resolveIdle();
    }
  }

  private startItem(item: QueueItem): void {
    const ownerKey = item.ownerKey || `job:${item.jobId}`;
    this.activeJobIds.add(item.jobId);
    this.activeOwnerKeys.add(ownerKey);

    void this.processItem(item)
      .catch((error) => {
        this.logger.error({ err: error, jobId: item.jobId }, "Processing job gagal.");
      })
      .finally(() => {
        this.activeJobIds.delete(item.jobId);
        this.activeOwnerKeys.delete(ownerKey);
        this.resolveIdle();
        void this.consume();
      });
  }

  private async takeNextRunnableItem(): Promise<QueueItem | undefined> {
    for (let index = 0; index < this.queue.length; index += 1) {
      const item = this.queue[index];
      if (!item) {
        continue;
      }

      if (!item.ownerKey) {
        const job = await this.jobsStore.getById(item.jobId);
        if (!job || job.status !== "queued") {
          this.removeQueuedJob(item.jobId);
          index -= 1;
          continue;
        }
        item.ownerKey = getJobOwnerKey(job);
      }

      if (this.activeOwnerKeys.has(item.ownerKey)) {
        continue;
      }

      this.queue.splice(index, 1);
      this.queuedJobIds.delete(item.jobId);
      return item;
    }

    return undefined;
  }

  private async processItem(item: QueueItem): Promise<void> {
    const job = await this.jobsStore.getById(item.jobId);
    if (!job) {
      return;
    }

    const settings = await this.settingsStore.get();
    await this.updateJob(item.jobId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      status: "running",
      progress: buildJobProgress("analyzing", {
        percent: 15,
        label: "Memulai proses"
      }),
      errorMessage: undefined,
      output: {
        ...current.output,
        updatedAt: nowIso()
      }
    }));

    let uploadedVideo: UploadedAiFile[] = [];
    let framesDir = "";
    try {
      await this.setJobProgress(item.jobId, "analyzing");
      this.logger.info({ jobId: item.jobId }, "Mengekstrak frame video.");
      framesDir = await mkdtemp(path.join(os.tmpdir(), `voice-shorts-frames-${job.jobId}-`));
      const { extractVideoFrames } = await import("../utils/video.js");
      const frames = await extractVideoFrames(job.videoPath, framesDir, { fps: 0.33 });
      
      this.logger.info({ jobId: item.jobId }, `Ekstrak frame selesai (${frames.length} frame), menyiapkan base64 secara paralel.`);
      
      // Memproses semua frame secara paralel untuk kecepatan maksimal
      uploadedVideo = await Promise.all(
        frames.map(async (framePath) => {
          const fileBuffer = await readFile(framePath);
          return {
            provider: "litellm",
            mimeType: "image/jpeg",
            base64Data: fileBuffer.toString("base64")
          };
        })
      );
      
      this.logger.info(
        { jobId: item.jobId, count: uploadedVideo.length },
        "Konversi frame ke base64 selesai. Menghapus frame lokal."
      );
      await rm(framesDir, { recursive: true, force: true });
      framesDir = "";
    } catch (error) {
      if (framesDir) {
        await rm(framesDir, { recursive: true, force: true }).catch(() => {});
      }
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
        frameCount: uploadedVideo.length,
        ctaText: job.ctaText,
        referenceLink: job.referenceLink
      };

      let scriptText = "";
      let visualBrief: VisualBrief | undefined;
      try {
        await this.setJobProgress(item.jobId, "analyzing");
        this.logger.info({ jobId: item.jobId }, "Memulai analisis visual video.");
        const visualBriefPrompt = buildVisualBriefPrompt(promptInput);
        visualBrief = await this.aiService.generateVisualBrief({
          model: settings.scriptModel,
          prompt: visualBriefPrompt,
          video: uploadedVideo
        });
        this.logger.info({ jobId: item.jobId }, "Analisis visual video selesai.");

        await this.setJobProgress(item.jobId, "scripting");
        this.logger.info({ jobId: item.jobId }, "Memulai penyusunan script voice over.");
        const scriptPrompt = buildScriptPrompt({
          ...promptInput,
          visualBrief
        });
        scriptText = await this.aiService.generateScript({
          model: settings.scriptModel,
          prompt: scriptPrompt
        });
        this.logger.info({ jobId: item.jobId }, "Penyusunan script voice over selesai.");
      } catch (error) {
        if (!(error instanceof InvalidGeminiStructuredOutputError)) {
          throw error;
        }

        this.logger.warn(
          { err: error, jobId: item.jobId },
          "Visual brief tidak valid, memakai fallback multimodal langsung."
        );

        await this.setJobProgress(item.jobId, "scripting");
        this.logger.info({ jobId: item.jobId }, "Memulai fallback script multimodal.");
        const scriptPrompt = buildScriptPrompt(promptInput);
        scriptText = await this.aiService.generateScript({
          model: settings.scriptModel,
          prompt: scriptPrompt,
          video: uploadedVideo
        });
        this.logger.info({ jobId: item.jobId }, "Fallback script multimodal selesai.");
      }

      await this.setJobProgress(item.jobId, "synthesizing");
      this.logger.info({ jobId: item.jobId }, "Memulai sintesis voice over.");
      const voiceProfile = await this.settingsStore.getVoiceForGender(job.voiceGender);
      scriptText = await this.synthesizeVoiceAlignedToVideo({
        jobId: item.jobId,
        promptInput,
        scriptText,
        visualBrief,
        uploadedVideo,
        voicePath,
        scriptModel: settings.scriptModel,
        ttsModel: settings.ttsModel,
        voiceName: voiceProfile.voiceName,
        speechRate: voiceProfile.speechRate,
        deliveryHint: job.tone
      });
      this.logger.info({ jobId: item.jobId }, "Sintesis voice over selesai.");

      await this.setJobProgress(item.jobId, "captioning");
      this.logger.info({ jobId: item.jobId }, "Memulai pembuatan caption dari script final.");
      const captionPrompt = buildCaptionPrompt({
        ...promptInput,
        scriptText,
        visualBrief
      });
      const rawSocialMetadata = await this.aiService.generateCaptionMetadata({
        model: settings.scriptModel,
        prompt: captionPrompt,
        video: visualBrief ? undefined : uploadedVideo
      });
      const socialMetadata = ensureSocialMetadata(
        rawSocialMetadata,
        scriptText,
        buildFallbackHashtags(job.contentType)
      );
      await writeFile(captionPath, formatSocialMetadataFile(socialMetadata), "utf8");
      this.logger.info({ jobId: item.jobId }, "Pembuatan caption selesai.");

      await this.setJobProgress(item.jobId, "rendering");
      this.logger.info({ jobId: item.jobId }, "Memulai render video final.");
      await combineVideoWithVoiceOver(job.videoPath, voicePath, finalPath, job.videoDurationSec);
      this.logger.info({ jobId: item.jobId }, "Render video final selesai.");
      await rm(voiceTempDir, { recursive: true, force: true });
      voiceTempDir = "";
      await cleanupSuccessfulUpload(job.jobId, this.logger);

      const artifactUrls = [
        toOutputUrl(job.jobId, captionFilename),
        toOutputUrl(job.jobId, finalFilename)
      ];

      await this.updateJob(item.jobId, (current) => ({
        ...current,
        updatedAt: nowIso(),
        status: "success",
        progress: buildJobProgress("success"),
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
    await this.updateJob(jobId, (current) => ({
      ...current,
      updatedAt: nowIso(),
      status: "failed",
      progress: buildJobProgress("failed"),
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
