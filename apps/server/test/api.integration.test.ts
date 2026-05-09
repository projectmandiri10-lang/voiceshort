import FormData from "form-data";
import pino from "pino";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JobEvents } from "../src/services/job-events.js";
import { DEFAULT_SETTINGS } from "../src/constants.js";
import { JobsStore } from "../src/stores/jobs-store.js";
import { SettingsStore } from "../src/stores/settings-store.js";
import { UsersStore } from "../src/stores/users-store.js";
import type { AuthSessionUser, JobRecord, UserRecord } from "../src/types.js";
import { buildJobProgress } from "../src/utils/job-progress.js";
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
    ownerEmail: "creator@test.dev",
    title: "Job Satu",
    description: "Brief awal",
    contentType: "affiliate",
    voiceGender: "female",
    tone: "natural",
    videoPath: "C:/video.mp4",
    videoMimeType: "video/mp4",
    videoDurationSec: 20,
    status: "failed",
    progress: buildJobProgress("failed"),
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

function bearerHeader(token: string): string {
  return `Bearer ${token}`;
}

function toSessionUser(user: UserRecord): AuthSessionUser {
  const isUnlimited = user.isUnlimited;
  const generateCreditsRemaining = isUnlimited ? null : Math.floor(user.walletBalanceIdr / 2000);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    videoQuotaTotal: user.videoQuotaTotal,
    videoQuotaUsed: user.videoQuotaUsed,
    videoQuotaRemaining: generateCreditsRemaining,
    walletBalanceIdr: user.walletBalanceIdr,
    generatePriceIdr: 2000,
    generateCreditsRemaining,
    isUnlimited,
    disabledAt: user.disabledAt ?? null,
    disabledReason: user.disabledReason ?? null,
    assignedPackageCode: user.assignedPackageCode ?? null
  };
}

describe("api integration", () => {
  const logger = pino({ level: "silent" });
  const settingsStore = new SettingsStore();
  const jobsStore = new JobsStore();
  const usersStore = new UsersStore();
  const jobEvents = new JobEvents();
  const enqueueCalls: string[] = [];
  const openCalls: string[] = [];
  const previewSpeechCalls: Array<Record<string, unknown>> = [];
  let processorOverloaded = false;
  let forceEnqueueFailure = false;
  let processorQueuedCount = 0;
  const processor = {
    enqueue(jobId: string) {
      if (forceEnqueueFailure || processorOverloaded || processorQueuedCount >= 20) {
        return false;
      }
      enqueueCalls.push(jobId);
      processorQueuedCount += 1;
      return true;
    },
    getCapacitySnapshot() {
      const overloaded = processorOverloaded || processorQueuedCount >= 20;
      return {
        overloaded,
        runningCount: 0,
        queuedCount: processorQueuedCount,
        maxRunningJobs: 3,
        maxQueuedJobs: 20,
        maxRunningPerUser: 1,
        message: overloaded
          ? "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi."
          : "Server siap menerima job baru."
      };
    },
    removeQueuedJob(jobId: string) {
      const index = enqueueCalls.indexOf(jobId);
      if (index >= 0) {
        enqueueCalls.splice(index, 1);
        processorQueuedCount = Math.max(0, processorQueuedCount - 1);
      }
    },
    async hydrateQueuedJobs() {
      return;
    }
  };

  let app: Awaited<ReturnType<typeof buildApp>>;
  let creatorToken = "";
  let otherUserToken = "";
  let adminToken = "";
  let probeDuration: (videoPath: string) => Promise<number>;
  let sessionByToken: Map<string, AuthSessionUser>;

  beforeEach(async () => {
    enqueueCalls.length = 0;
    openCalls.length = 0;
    previewSpeechCalls.length = 0;
    processorOverloaded = false;
    forceEnqueueFailure = false;
    processorQueuedCount = 0;
    probeDuration = async () => 30;
    await resetTestStorage();
    await settingsStore.set(DEFAULT_SETTINGS);

    const creator = await usersStore.create({
      id: "user-creator",
      email: "creator@test.dev",
      displayName: "Creator",
      role: "user",
      subscriptionStatus: "active",
      videoQuotaTotal: 10,
      videoQuotaUsed: 0,
      walletBalanceIdr: 20_000,
      isUnlimited: false,
      disabledAt: null,
      disabledReason: null,
      assignedPackageCode: null,
      googleLinked: false,
      hasPassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const otherUser = await usersStore.create({
      id: "user-other",
      email: "other@test.dev",
      displayName: "Other",
      role: "user",
      subscriptionStatus: "inactive",
      videoQuotaTotal: 0,
      videoQuotaUsed: 0,
      walletBalanceIdr: 0,
      isUnlimited: false,
      disabledAt: null,
      disabledReason: null,
      assignedPackageCode: null,
      googleLinked: false,
      hasPassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const admin = await usersStore.create({
      id: "user-admin",
      email: "jho.j80@gmail.com",
      displayName: "Jho",
      role: "superadmin",
      subscriptionStatus: "active",
      videoQuotaTotal: 1000,
      videoQuotaUsed: 0,
      walletBalanceIdr: 2_000_000,
      isUnlimited: true,
      disabledAt: null,
      disabledReason: null,
      assignedPackageCode: null,
      googleLinked: true,
      hasPassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    creatorToken = "token-creator";
    otherUserToken = "token-other";
    adminToken = "token-admin";

    sessionByToken = new Map<string, AuthSessionUser>([
      [creatorToken, toSessionUser(creator)],
      [otherUserToken, toSessionUser(otherUser)],
      [adminToken, toSessionUser(admin)]
    ]);

    app = await buildApp({
      logger,
      webOrigins: ["http://localhost:5174"],
      settingsStore,
      jobsStore,
      usersStore,
      processor,
      billingService: {
        generatePriceIdr: 2000,
        getWallet: async (user: AuthSessionUser) => ({
          walletBalanceIdr: user.walletBalanceIdr,
          generatePriceIdr: 2000,
          generateCreditsRemaining: user.isUnlimited ? null : Math.floor(user.walletBalanceIdr / 2000),
          isUnlimited: user.isUnlimited,
          packages: [],
          recentLedger: [],
          recentTopups: []
        }),
        createTopup: async () => {
          throw new Error("not implemented in test");
        },
        getTopupStatus: async () => {
          throw new Error("not implemented in test");
        },
        handleWebhook: async () => ({ success: true })
      } as any,
      authService: {
        async getSessionContext(request) {
          const header = request.headers.authorization || "";
          const token = header.replace(/^Bearer\s+/i, "").trim();
          const user = sessionByToken.get(token);
          if (!user) {
            return undefined;
          }
          return {
            accessToken: token,
            db: undefined as never,
            user
          };
        }
      } as any,
      jobEvents,
      probeDuration: async (videoPath) => probeDuration(videoPath),
      openOutputLocation: async (folderPath) => {
        openCalls.push(folderPath);
      },
      speechGenerator: {
        generateSpeech: async (input) => {
          previewSpeechCalls.push(input as Record<string, unknown>);
          return {
          data: Buffer.from("preview-audio"),
          mimeType: "audio/wav"
          };
        }
      },
      writePreviewAudio: async (_data, _mimeType, outputPath) => {
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

  it("creates a general job from multipart upload and consumes deposit credit", async () => {
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
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(202);
    const payload = response.json() as { jobId: string; status: string };
    expect(payload.status).toBe("queued");
    expect(enqueueCalls).toEqual([payload.jobId]);
    const saved = await jobsStore.getById(payload.jobId);
    expect(saved?.ownerEmail).toBe("creator@test.dev");
    expect(saved?.ownerUserId).toBe("user-creator");
    expect(saved?.contentType).toBe("edukasi");
    const user = await usersStore.getByEmail("creator@test.dev");
    expect(user?.videoQuotaUsed).toBe(1);
    expect(user?.walletBalanceIdr).toBe(18_000);
  });

  it("charges 2 billed minutes for videos above 60 seconds", async () => {
    probeDuration = async () => 61;
    const form = buildCreateForm();

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(202);
    const user = await usersStore.getByEmail("creator@test.dev");
    expect(user?.walletBalanceIdr).toBe(16_000);
    expect(user?.videoQuotaUsed).toBe(1);
  });

  it("rejects create job when deposit balance is insufficient", async () => {
    const form = buildCreateForm();

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(otherUserToken)
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      message: "Gagal memproses upload video."
    });
  });

  it("rejects create job above 15 minutes", async () => {
    probeDuration = async () => 901;
    const form = buildCreateForm();

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: "Durasi video 901.00s melebihi batas 900s."
    });
  });

  it("rejects create job when another owned job is still queued", async () => {
    await jobsStore.create(
      buildJobRecord({
        jobId: "job-queued",
        status: "queued",
        progress: buildJobProgress("queued")
      })
    );
    const form = buildCreateForm();

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message:
        "Masih ada job sebelumnya yang sedang antre atau diproses. Tunggu sampai selesai terlebih dahulu sebelum membuat job baru.",
      jobId: "job-queued",
      blockerType: "active-job"
    });
    expect(enqueueCalls).toEqual([]);
  });

  it("rejects create job until caption and final video are downloaded", async () => {
    await jobsStore.create(
      buildJobRecord({
        jobId: "job-success-pending",
        status: "success",
        progress: buildJobProgress("success"),
        output: {
          captionPath: "/outputs/job-success-pending/caption.txt",
          finalVideoPath: "/outputs/job-success-pending/final.mp4",
          artifactPaths: [
            "/outputs/job-success-pending/caption.txt",
            "/outputs/job-success-pending/final.mp4"
          ]
        }
      })
    );
    const form = buildCreateForm();

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message:
        "Job sebelumnya sudah selesai. Unduh caption dan final video terlebih dahulu sebelum membuat job baru.",
      jobId: "job-success-pending",
      blockerType: "pending-download"
    });
  });

  it("returns generation capacity snapshot for authenticated users", async () => {
    processorQueuedCount = 4;

    const response = await app.inject({
      method: "GET",
      url: "/api/generation-capacity",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      overloaded: false,
      runningCount: 0,
      queuedCount: 4,
      maxRunningJobs: 3,
      maxQueuedJobs: 20,
      maxRunningPerUser: 1
    });
  });

  it("creates a voice preview path through the speech generator", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tts/preview",
      payload: {
        voiceName: "Leda",
        speechRate: 1
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { voiceName: string; previewPath: string };
    expect(payload.voiceName).toBe("Leda");
    expect(payload.previewPath).toContain("/outputs/_voice_previews/");
    expect(previewSpeechCalls[0]).toMatchObject({
      model: DEFAULT_SETTINGS.ttsModel,
      voiceName: "Leda",
      speechRate: 1
    });
    expect(String(previewSpeechCalls[0]?.deliveryHint || "")).toContain("natural");
  });

  it("marks caption and final video as downloaded through authenticated endpoints", async () => {
    await jobsStore.create(
      buildJobRecord({
        jobId: "job-downloadable",
        status: "success",
        progress: buildJobProgress("success"),
        output: {
          captionPath: "/outputs/job-downloadable/caption.txt",
          finalVideoPath: "/outputs/job-downloadable/final.mp4",
          artifactPaths: [
            "/outputs/job-downloadable/caption.txt",
            "/outputs/job-downloadable/final.mp4"
          ]
        }
      })
    );
    const outputDir = path.join(OUTPUTS_DIR, "job-downloadable");
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "caption.txt"), "caption", "utf8");
    await writeFile(path.join(outputDir, "final.mp4"), "video", "utf8");

    const captionResponse = await app.inject({
      method: "GET",
      url: "/api/jobs/job-downloadable/download/caption",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });
    expect(captionResponse.statusCode).toBe(200);
    expect(captionResponse.headers["content-disposition"]).toContain("attachment");
    const afterCaption = await jobsStore.getById("job-downloadable");
    expect(afterCaption?.output.captionDownloadedAt).toBeTruthy();
    expect(afterCaption?.output.finalVideoDownloadedAt).toBeUndefined();

    const finalResponse = await app.inject({
      method: "GET",
      url: "/api/jobs/job-downloadable/download/final-video",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });
    expect(finalResponse.statusCode).toBe(200);
    expect(finalResponse.headers["content-disposition"]).toContain("attachment");
    const afterFinal = await jobsStore.getById("job-downloadable");
    expect(afterFinal?.output.captionDownloadedAt).toBeTruthy();
    expect(afterFinal?.output.finalVideoDownloadedAt).toBeTruthy();
  });

  it("rejects create job with server overload before reserving credit", async () => {
    processorOverloaded = true;
    const form = buildCreateForm();

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      message: "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi."
    });

    const user = await usersStore.getByEmail("creator@test.dev");
    expect(user?.videoQuotaUsed).toBe(0);
    expect(user?.walletBalanceIdr).toBe(20_000);
    expect(enqueueCalls).toEqual([]);
  });

  it("refunds the reserved variable charge when enqueue fails after reserve", async () => {
    probeDuration = async () => 61;
    forceEnqueueFailure = true;
    const form = buildCreateForm();

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      message: "Gagal memproses upload video."
    });

    const user = await usersStore.getByEmail("creator@test.dev");
    expect(user?.walletBalanceIdr).toBe(20_000);
    expect(user?.videoQuotaUsed).toBe(0);
  });

  it("removes fully downloaded success jobs when a new job is created", async () => {
    await jobsStore.create(
      buildJobRecord({
        jobId: "job-cleanup-old",
        status: "success",
        progress: buildJobProgress("success"),
        output: {
          captionPath: "/outputs/job-cleanup-old/caption.txt",
          finalVideoPath: "/outputs/job-cleanup-old/final.mp4",
          captionDownloadedAt: "2026-04-01T00:10:00.000Z",
          finalVideoDownloadedAt: "2026-04-01T00:11:00.000Z",
          artifactPaths: [
            "/outputs/job-cleanup-old/caption.txt",
            "/outputs/job-cleanup-old/final.mp4"
          ]
        }
      })
    );
    const form = buildCreateForm({
      title: "Job Baru Setelah Cleanup"
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(202);
    const payload = response.json() as { jobId: string };
    expect(payload.jobId).toBeTruthy();
    expect(await jobsStore.getById("job-cleanup-old")).toBeUndefined();
    expect(await jobsStore.getById(payload.jobId)).toBeTruthy();
  });

  it("allows unlimited whitelist user to create jobs without reducing balance", async () => {
    const updatedAdmin = await usersStore.update("jho.j80@gmail.com", (current) => ({
      ...current,
      walletBalanceIdr: 0,
      isUnlimited: true,
      updatedAt: new Date().toISOString()
    }));
    sessionByToken.set(adminToken, toSessionUser(updatedAdmin as UserRecord));

    const form = buildCreateForm();
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(adminToken)
      }
    });

    expect(response.statusCode).toBe(202);
    const admin = await usersStore.getByEmail("jho.j80@gmail.com");
    expect(admin?.walletBalanceIdr).toBe(0);
    expect(admin?.videoQuotaUsed).toBe(1);
  });

  it("blocks disabled users from protected actions", async () => {
    sessionByToken.set(creatorToken, {
      ...sessionByToken.get(creatorToken)!,
      disabledAt: new Date().toISOString(),
      disabledReason: "Tes nonaktif"
    });

    const form = buildCreateForm();
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: form.getBuffer(),
      headers: {
        ...form.getHeaders(),
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      message: "Akun Anda sedang nonaktif. Hubungi admin untuk mengaktifkan kembali."
    });
  });

  it("blocks regular users from deleting success jobs that still require download and lets superadmin override", async () => {
    await jobsStore.create(
      buildJobRecord({
        jobId: "job-delete-pending-download",
        status: "success",
        progress: buildJobProgress("success"),
        output: {
          captionPath: "/outputs/job-delete-pending-download/caption.txt",
          finalVideoPath: "/outputs/job-delete-pending-download/final.mp4",
          artifactPaths: [
            "/outputs/job-delete-pending-download/caption.txt",
            "/outputs/job-delete-pending-download/final.mp4"
          ]
        }
      })
    );

    const forbiddenResponse = await app.inject({
      method: "DELETE",
      url: "/api/jobs/job-delete-pending-download",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });
    expect(forbiddenResponse.statusCode).toBe(409);
    expect(forbiddenResponse.json()).toMatchObject({
      message: "Job selesai ini harus diunduh dulu sebelum bisa dihapus."
    });

    const adminResponse = await app.inject({
      method: "DELETE",
      url: "/api/jobs/job-delete-pending-download",
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });
    expect(adminResponse.statusCode).toBe(200);
    expect(await jobsStore.getById("job-delete-pending-download")).toBeUndefined();
  });

  it("allows superadmin to update settings and user quota", async () => {
    const goodResponse = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: {
        ...DEFAULT_SETTINGS,
        scriptModel: "custom-script-model"
      },
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });
    expect(goodResponse.statusCode).toBe(200);

    const userResponse = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${encodeURIComponent("creator@test.dev")}`,
      payload: {
        subscriptionStatus: "active",
        videoQuotaTotal: 25,
        videoQuotaUsed: 1
      },
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });

    expect(userResponse.statusCode).toBe(200);
    expect(userResponse.json()).toMatchObject({
      email: "creator@test.dev",
      videoQuotaTotal: 25,
      videoQuotaUsed: 1
    });
  });

  it("lets superadmin create, update, grant saldo, and soft-disable users", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      payload: {
        email: "baru@test.dev",
        password: "password-baru",
        displayName: "User Baru",
        role: "user",
        subscriptionStatus: "active",
        isUnlimited: false
      },
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      email: "baru@test.dev",
      displayName: "User Baru",
      isUnlimited: false
    });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${encodeURIComponent("baru@test.dev")}`,
      payload: {
        displayName: "User Baru Edit",
        isUnlimited: true,
        assignedPackageCode: "custom"
      },
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      displayName: "User Baru Edit",
      isUnlimited: true,
      assignedPackageCode: "custom"
    });

    const grantResponse = await app.inject({
      method: "POST",
      url: `/api/admin/users/${encodeURIComponent("baru@test.dev")}/package-grants`,
      payload: {
        packageCode: "custom",
        customAmountIdr: 5_000,
        description: "Bonus test"
      },
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });
    expect(grantResponse.statusCode).toBe(201);
    expect(grantResponse.json()).toMatchObject({
      walletBalanceIdr: 5_000,
      assignedPackageCode: "custom"
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${encodeURIComponent("baru@test.dev")}`,
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({
      subscriptionStatus: "inactive",
      disabledReason: "Dinonaktifkan oleh admin"
    });
    expect(deleteResponse.json().disabledAt).toBeTruthy();
  });

  it("rejects admin user management for non-superadmin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      payload: {
        email: "nope@test.dev",
        password: "password-baru"
      },
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it("limits job access to owner or superadmin", async () => {
    await jobsStore.create(buildJobRecord());

    const forbiddenResponse = await app.inject({
      method: "GET",
      url: "/api/jobs/job-1",
      headers: {
        Authorization: bearerHeader(otherUserToken)
      }
    });
    expect(forbiddenResponse.statusCode).toBe(404);

    const ownerResponse = await app.inject({
      method: "GET",
      url: "/api/jobs/job-1",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });
    expect(ownerResponse.statusCode).toBe(200);

    const adminResponse = await app.inject({
      method: "GET",
      url: "/api/jobs/job-1",
      headers: {
        Authorization: bearerHeader(adminToken)
      }
    });
    expect(adminResponse.statusCode).toBe(200);
  });

  it("rejects retry when server overload is active", async () => {
    await jobsStore.create(buildJobRecord({ jobId: "job-retry-overload" }));
    processorOverloaded = true;

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-retry-overload/retry",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      message: "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi."
    });

    const stored = await jobsStore.getById("job-retry-overload");
    expect(stored?.status).toBe("failed");
    expect(enqueueCalls).toEqual([]);
  });

  it("updates editable job metadata without hashtag hints", async () => {
    await jobsStore.create(
      buildJobRecord({
        jobId: "job-editable",
        status: "queued",
        progress: buildJobProgress("queued")
      })
    );

    const response = await app.inject({
      method: "PUT",
      url: "/api/jobs/job-editable",
      payload: {
        title: "Judul Baru",
        description: "Brief baru",
        contentType: "motivasi",
        voiceGender: "male",
        tone: "tegas",
        ctaText: "cek sekarang",
        referenceLink: "https://contoh.test/baru"
      },
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      jobId: "job-editable",
      title: "Judul Baru",
      description: "Brief baru",
      contentType: "motivasi",
      voiceGender: "male",
      tone: "tegas",
      ctaText: "cek sekarang",
      referenceLink: "https://contoh.test/baru"
    });
  });

  it("maps legacy script output to captionPath and opens output folder", async () => {
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
      url: "/api/jobs/job-legacy",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      jobId: "job-legacy",
      output: {
        captionPath: "/outputs/job-legacy/script.txt",
        scriptPath: "/outputs/job-legacy/script.txt"
      }
    });

    const outputDir = path.join(OUTPUTS_DIR, "job-legacy");
    await mkdir(outputDir, { recursive: true });
    const openResponse = await app.inject({
      method: "POST",
      url: "/api/jobs/job-legacy/open-location",
      headers: {
        Authorization: bearerHeader(creatorToken)
      }
    });
    expect(openResponse.statusCode).toBe(200);
    expect(openCalls).toContain(outputDir);
  });
});
