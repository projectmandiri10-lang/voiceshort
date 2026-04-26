import FormData from "form-data";
import pino from "pino";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { DEFAULT_SETTINGS } from "../src/constants.js";
import { JobsStore } from "../src/stores/jobs-store.js";
import { SettingsStore } from "../src/stores/settings-store.js";
import type { JobRecord } from "../src/types.js";
import { OUTPUTS_DIR } from "../src/utils/paths.js";
import { resetTestStorage } from "./helpers.js";

function buildCreateForm(overrides?: {
  title?: string;
  description?: string;
  contentType?: string | null;
  voiceGender?: string;
  tone?: string;
  ctaText?: string;
  referenceLink?: string;
}) {
  const form = new FormData();
  form.append("video", Buffer.from("fake-video-data"), {
    filename: "clip.mp4",
    contentType: "video/mp4"
  });
  form.append("title", overrides?.title ?? "Judul Tes");
  form.append("description", overrides?.description ?? "Deskripsi Tes");
  if (overrides?.contentType !== null) {
    form.append("contentType", overrides?.contentType ?? "affiliate");
  }
  form.append("voiceGender", overrides?.voiceGender ?? "female");
  form.append("tone", overrides?.tone ?? "natural");
  if (overrides?.ctaText) {
    form.append("ctaText", overrides.ctaText);
  }
  if (overrides?.referenceLink) {
    form.append("referenceLink", overrides.referenceLink);
  }
  return form;
}

function buildJobRecord(
  overrides: Partial<JobRecord> & {
    output?: Partial<JobRecord["output"]>;
  } = {}
): JobRecord {
  const { output, ...jobOverrides } = overrides;
  const now = new Date().toISOString();

  return {
    jobId: "job-1",
    createdAt: now,
    updatedAt: now,
    title: "Job Satu",
    description: "Brief awal",
    contentType: "affiliate",
    voiceGender: "female",
    tone: "natural",
    videoPath: "C:/video.mp4",
    videoMimeType: "video/mp4",
    videoDurationSec: 20,
    status: "failed",
    progress: 100,
    progressLabel: "Generate voice over gagal.",
    errorMessage: "gagal",
    output: {
      captionPath: "/outputs/job-1/caption.txt",
      voicePath: "/outputs/job-1/voice.wav",
      finalVideoPath: "/outputs/job-1/final.mp4",
      artifactPaths: [
        "/outputs/job-1/caption.txt",
        "/outputs/job-1/voice.wav",
        "/outputs/job-1/final.mp4"
      ],
      updatedAt: now,
      ...output
    },
    ...jobOverrides
  };
}

describe("api integration", () => {
  const logger = pino({ level: "silent" });
  const settingsStore = new SettingsStore();
  const jobsStore = new JobsStore();
  const enqueueCalls: string[] = [];
  const openCalls: string[] = [];
  const previewWrites: string[] = [];
  const processor = {
    enqueue(jobId: string) {
      enqueueCalls.push(jobId);
    }
  };

  let app: Awaited<ReturnType<typeof buildApp>>;
  let probeDuration: (videoPath: string) => Promise<number>;
  let generateSpeech: (
    input: {
      model: string;
      text: string;
      voiceName: string;
      speechRate: number;
    }
  ) => Promise<{ data: Buffer; mimeType: string }>;

  beforeEach(async () => {
    enqueueCalls.length = 0;
    openCalls.length = 0;
    previewWrites.length = 0;
    probeDuration = async () => 30;
    generateSpeech = async () => ({
      data: Buffer.from("preview-audio"),
      mimeType: "audio/wav"
    });
    await resetTestStorage();
    await settingsStore.set(DEFAULT_SETTINGS);
    app = await buildApp({
      logger,
      webOrigins: ["http://localhost:5174"],
      settingsStore,
      jobsStore,
      processor,
      probeDuration: async (videoPath) => probeDuration(videoPath),
      openOutputLocation: async (folderPath) => {
        openCalls.push(folderPath);
      },
      speechGenerator: {
        generateSpeech: async (input) => generateSpeech(input)
      },
      writePreviewAudio: async (_data, _mimeType, outputPath) => {
        previewWrites.push(outputPath);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "preview", "utf8");
      }
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("creates a general job from multipart upload", async () => {
    const form = buildCreateForm({
      contentType: "edukasi",
      voiceGender: "male",
      tone: "informatif",
      referenceLink: "https://contoh.test/ref"
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: form.getHeaders()
    });

    expect(response.statusCode).toBe(202);
    const payload = response.json() as { jobId: string; status: string };
    expect(payload.status).toBe("queued");
    expect(enqueueCalls).toEqual([payload.jobId]);
    const saved = await jobsStore.getById(payload.jobId);
    expect(saved?.contentType).toBe("edukasi");
    expect(saved?.voiceGender).toBe("male");
    expect(saved?.referenceLink).toBe("https://contoh.test/ref");
  });

  it("rejects create job if contentType is missing", async () => {
    const form = buildCreateForm({ contentType: null });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: form.getHeaders()
    });

    expect(response.statusCode).toBe(400);
  });

  it("updates settings and rejects unknown voice names", async () => {
    const goodResponse = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: {
        ...DEFAULT_SETTINGS,
        scriptModel: "custom-script-model"
      }
    });
    expect(goodResponse.statusCode).toBe(200);

    const badResponse = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: {
        ...DEFAULT_SETTINGS,
        genderVoices: DEFAULT_SETTINGS.genderVoices.map((voice) =>
          voice.gender === "male"
            ? {
                ...voice,
                voiceName: "UnknownVoice"
              }
            : voice
        )
      }
    });
    expect(badResponse.statusCode).toBe(400);
  });

  it("keeps failed job metadata updates separate from retry state changes", async () => {
    await jobsStore.create(buildJobRecord());

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/jobs/job-1",
      payload: {
        title: "Job Baru",
        description: "Brief baru",
        contentType: "motivasi",
        voiceGender: "male",
        tone: "hangat",
        ctaText: "ikuti sekarang",
        referenceLink: "https://contoh.test/a"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      title: "Job Baru",
      description: "Brief baru",
      contentType: "motivasi",
      voiceGender: "male",
      tone: "hangat",
      status: "failed",
      errorMessage: "gagal",
      output: {
        captionPath: "/outputs/job-1/caption.txt",
        voicePath: "/outputs/job-1/voice.wav",
        finalVideoPath: "/outputs/job-1/final.mp4"
      }
    });

    const storedAfterUpdate = await jobsStore.getById("job-1");
    expect(storedAfterUpdate).toMatchObject({
      title: "Job Baru",
      description: "Brief baru",
      contentType: "motivasi",
      voiceGender: "male",
      tone: "hangat",
      status: "failed",
      errorMessage: "gagal",
      output: {
        captionPath: "/outputs/job-1/caption.txt",
        voicePath: "/outputs/job-1/voice.wav",
        finalVideoPath: "/outputs/job-1/final.mp4"
      }
    });

    const retryResponse = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/retry"
    });
    expect(retryResponse.statusCode).toBe(200);
    expect(enqueueCalls).toContain("job-1");

    const storedAfterRetry = await jobsStore.getById("job-1");
    expect(storedAfterRetry?.status).toBe("queued");
    expect(storedAfterRetry?.errorMessage).toBeUndefined();
    expect(storedAfterRetry?.output.artifactPaths).toEqual([]);
    expect(storedAfterRetry?.output.captionPath).toBeUndefined();
    expect(storedAfterRetry?.output.scriptPath).toBeUndefined();
    expect(storedAfterRetry?.output.voicePath).toBeUndefined();
    expect(storedAfterRetry?.output.finalVideoPath).toBeUndefined();

    const outputDir = path.join(OUTPUTS_DIR, "job-1");
    await mkdir(outputDir, { recursive: true });
    const openResponse = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/open-location"
    });
    expect(openResponse.statusCode).toBe(200);
    expect(openCalls).toContain(outputDir);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/jobs/job-1"
    });
    expect(deleteResponse.statusCode).toBe(200);
  });

  it("maps legacy script output to captionPath for api responses", async () => {
    await jobsStore.create(
      buildJobRecord({
        jobId: "job-legacy",
        output: {
          captionPath: undefined,
          scriptPath: "/outputs/job-legacy/script.txt",
          voicePath: "/outputs/job-legacy/voice.wav",
          finalVideoPath: "/outputs/job-legacy/final.mp4",
          artifactPaths: [
            "/outputs/job-legacy/script.txt",
            "/outputs/job-legacy/voice.wav",
            "/outputs/job-legacy/final.mp4"
          ]
        }
      })
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: "/api/jobs/job-legacy"
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      jobId: "job-legacy",
      output: {
        captionPath: "/outputs/job-legacy/script.txt",
        scriptPath: "/outputs/job-legacy/script.txt",
        voicePath: "/outputs/job-legacy/voice.wav",
        finalVideoPath: "/outputs/job-legacy/final.mp4"
      }
    });

    const openResponse = await app.inject({
      method: "POST",
      url: "/api/jobs/job-legacy/open-location"
    });
    expect(openResponse.statusCode).toBe(200);
    expect(openCalls).toContain(path.join(OUTPUTS_DIR, "job-legacy"));
  });

  it("rejects editing running and success jobs with 409", async () => {
    for (const status of ["running", "success"] as const) {
      const jobId = `job-${status}`;
      await jobsStore.create(
        buildJobRecord({
          jobId,
          status,
          errorMessage: undefined,
          output: {
            artifactPaths: []
          }
        })
      );

      const response = await app.inject({
        method: "PUT",
        url: `/api/jobs/${jobId}`,
        payload: {
          title: "Tidak Boleh Edit",
          description: "Masih sama",
          contentType: "affiliate",
          voiceGender: "female",
          tone: "natural",
          ctaText: "cek sekarang"
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        message: "Job hanya bisa diedit saat status queued, failed, atau interrupted."
      });
    }
  });
});
