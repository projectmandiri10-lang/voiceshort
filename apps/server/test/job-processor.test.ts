import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/constants.js";
import { InvalidGeminiStructuredOutputError } from "../src/services/gemini-service.js";
import { JobProcessor } from "../src/services/job-processor.js";
import { JobsStore } from "../src/stores/jobs-store.js";
import { SettingsStore } from "../src/stores/settings-store.js";
import type { JobRecord, VisualBrief } from "../src/types.js";
import { OUTPUTS_DIR, UPLOADS_DIR, outputUrlToAbsolutePath } from "../src/utils/paths.js";
import { resetTestStorage } from "./helpers.js";

vi.mock("../src/utils/audio.js", async () => {
  const fs = await import("node:fs/promises");
  return {
    combineVideoWithVoiceOver: vi.fn(async (_videoPath: string, _audioPath: string, outputPath: string) => {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, "fake-mp4", "utf8");
    }),
    writeWav24kMono: vi.fn(async (_data: Buffer, _mimeType: string, outputPath: string) => {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, "fake-wav", "utf8");
    })
  };
});

const visualBrief: VisualBrief = {
  summary: "Video meja kerja berubah dari berantakan menjadi lebih rapi.",
  hook: {
    startSec: 0,
    endSec: 3,
    reason: "Kontras visual awal langsung terlihat."
  },
  timeline: [
    {
      startSec: 0,
      endSec: 3,
      primaryVisual: "Meja kerja berantakan",
      action: "Kamera menyorot kondisi awal",
      onScreenText: ["before"],
      narrationFocus: "Masalah utama terlihat jelas sejak awal",
      avoidClaims: ["Jangan klaim merek"]
    },
    {
      startSec: 3,
      endSec: 8,
      primaryVisual: "Organizer dipakai untuk merapikan meja",
      action: "Tangan menata barang ke beberapa kompartemen",
      onScreenText: ["after"],
      narrationFocus: "Perubahan visual bertahap",
      avoidClaims: ["Jangan klaim manfaat permanen"]
    }
  ],
  mustMention: ["perubahan visual meja kerja"],
  mustAvoid: ["klaim yang tidak terlihat"],
  uncertainties: ["bahan organizer tidak terlihat jelas"]
};

function buildJob(jobId: string): JobRecord {
  return {
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: "Tips Produktif",
    description: "Konten motivasi singkat untuk kerja fokus.",
    contentType: "motivasi",
    voiceGender: "male",
    tone: "hangat",
    videoPath: path.join(UPLOADS_DIR, jobId, "source.mp4"),
    videoMimeType: "video/mp4",
    videoDurationSec: 18,
    status: "queued",
    progress: 0,
    progressLabel: "Menunggu antrean generate voice over.",
    output: {
      artifactPaths: [],
      updatedAt: new Date().toISOString()
    }
  };
}

describe("job processor", () => {
  const logger = pino({ level: "silent" });
  const jobsStore = new JobsStore();
  const settingsStore = new SettingsStore();

  beforeEach(async () => {
    await resetTestStorage();
    await settingsStore.set(DEFAULT_SETTINGS);
  });

  it("uses visual brief first, then generates script and caption from text only", async () => {
    const jobId = "job-processor-1";
    const job = buildJob(jobId);
    await mkdir(path.dirname(job.videoPath), { recursive: true });
    await writeFile(job.videoPath, "fake-video", "utf8");
    await jobsStore.create(job);

    const gemini = {
      uploadVideo: vi.fn(async () => ({
        fileUri: "mock://video",
        mimeType: "video/mp4"
      })),
      generateVisualBrief: vi.fn(async () => visualBrief),
      generateScript: vi.fn(async () => "Ini script singkat yang mengikuti alur visual video."),
      generateCaptionMetadata: vi.fn(async () => ({
        caption: "Meja makin rapi, fokus kerja juga ikut kebantu.",
        hashtags: []
      })),
      generateSpeech: vi.fn(async () => ({
        data: Buffer.from("audio"),
        mimeType: "audio/wav"
      }))
    };

    const processor = new JobProcessor(jobsStore, settingsStore, gemini as never, logger);

    processor.enqueue(jobId);
    await processor.whenIdle();

    const updated = await jobsStore.getById(jobId);
    expect(updated?.status).toBe("success");
    expect(gemini.generateVisualBrief).toHaveBeenCalledTimes(1);
    expect(gemini.generateScript).toHaveBeenCalledTimes(1);
    expect(gemini.generateCaptionMetadata).toHaveBeenCalledTimes(1);
    expect(gemini.generateSpeech).toHaveBeenCalledTimes(1);
    expect(gemini.generateVisualBrief.mock.invocationCallOrder[0]).toBeLessThan(
      gemini.generateScript.mock.invocationCallOrder[0]
    );
    expect(gemini.generateScript.mock.calls[0][0].video).toBeUndefined();
    expect(gemini.generateCaptionMetadata.mock.calls[0][0].video).toBeUndefined();
    expect(gemini.generateScript.mock.calls[0][0].prompt).toContain("Sumber visual resmi");
    expect(gemini.generateCaptionMetadata.mock.calls[0][0].prompt).toContain("Sumber visual resmi");
    expect(updated?.output.captionPath).toBe("/outputs/job-processor-1/caption.txt");
    expect(updated?.output.voicePath).toBeUndefined();
    expect(updated?.output.finalVideoPath).toBe("/outputs/job-processor-1/final.mp4");
    expect(updated?.output.artifactPaths).toEqual([
      "/outputs/job-processor-1/caption.txt",
      "/outputs/job-processor-1/final.mp4"
    ]);

    const captionFile = outputUrlToAbsolutePath(updated?.output.captionPath || "");
    expect(await readFile(captionFile!, "utf8")).toBe(
      "Meja makin rapi, fokus kerja juga ikut kebantu.\n\n#motivasi #shorts #kontenindonesia #fyp\n"
    );
    expect((await readdir(path.join(OUTPUTS_DIR, jobId))).sort()).toEqual([
      "caption.txt",
      "final.mp4"
    ]);
  });

  it("falls back to legacy multimodal flow when visual brief output is invalid", async () => {
    const jobId = "job-processor-fallback";
    const job = buildJob(jobId);
    await mkdir(path.dirname(job.videoPath), { recursive: true });
    await writeFile(job.videoPath, "fake-video", "utf8");
    await jobsStore.create(job);

    const gemini = {
      uploadVideo: vi.fn(async () => ({
        fileUri: "mock://video",
        mimeType: "video/mp4"
      })),
      generateVisualBrief: vi.fn(async () => {
        throw new InvalidGeminiStructuredOutputError(
          "visualBrief",
          "Visual brief tidak memenuhi struktur minimal."
        );
      }),
      generateScript: vi.fn(async () => "Ini script fallback dari flow multimodal langsung."),
      generateCaptionMetadata: vi.fn(async () => ({
        caption: "Caption fallback tetap jadi tanpa mengubah output final.",
        hashtags: []
      })),
      generateSpeech: vi.fn(async () => ({
        data: Buffer.from("audio"),
        mimeType: "audio/wav"
      }))
    };

    const processor = new JobProcessor(jobsStore, settingsStore, gemini as never, logger);

    processor.enqueue(jobId);
    await processor.whenIdle();

    const updated = await jobsStore.getById(jobId);
    expect(updated?.status).toBe("success");
    expect(gemini.generateVisualBrief).toHaveBeenCalledTimes(1);
    expect(gemini.generateScript).toHaveBeenCalledTimes(1);
    expect(gemini.generateCaptionMetadata).toHaveBeenCalledTimes(1);
    expect(gemini.generateScript.mock.calls[0][0].video).toEqual({
      fileUri: "mock://video",
      mimeType: "video/mp4"
    });
    expect(gemini.generateCaptionMetadata.mock.calls[0][0].video).toEqual({
      fileUri: "mock://video",
      mimeType: "video/mp4"
    });
    expect(gemini.generateScript.mock.calls[0][0].prompt).toContain("Sumber visual:");
    expect(gemini.generateCaptionMetadata.mock.calls[0][0].prompt).toContain("Sumber visual:");
    expect(updated?.output.artifactPaths).toEqual([
      "/outputs/job-processor-fallback/caption.txt",
      "/outputs/job-processor-fallback/final.mp4"
    ]);
    expect(updated?.output.voicePath).toBeUndefined();
    expect((await readdir(path.join(OUTPUTS_DIR, jobId))).sort()).toEqual([
      "caption.txt",
      "final.mp4"
    ]);
  });
});
