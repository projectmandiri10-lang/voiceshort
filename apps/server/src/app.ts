import cors from "@fastify/cors";
import multipart, { type MultipartFile } from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply
} from "fastify";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import mime from "mime-types";
import { nanoid } from "nanoid";
import { GEMINI_EXCITED_PRESETS, GEMINI_TTS_VOICES, MAX_UPLOAD_BYTES, findTtsVoiceByName } from "./constants.js";
import type { AuthService } from "./services/auth-service.js";
import { getDepositPackage, type BillingService } from "./services/billing-service.js";
import { JobEvents } from "./services/job-events.js";
import { JobsStore } from "./stores/jobs-store.js";
import { SettingsStore } from "./stores/settings-store.js";
import { UsersStore } from "./stores/users-store.js";
import type { AuthSessionUser, GenerateSpeechInput, JobOutput, JobRecord } from "./types.js";
import {
  parseAdminPackageGrantInput,
  parseAdminUserCreateInput,
  parseAdminUserUpdateInput,
  parseJobCreateInput,
  parseJobUpdateInput,
  parseSettings,
  parseTtsPreviewInput
} from "./validation.js";
import {
  OUTPUTS_DIR,
  UPLOADS_DIR,
  WEB_DIST_DIR,
  outputUrlToAbsolutePath
} from "./utils/paths.js";
import { buildJobProgress, buildProgressFromStatus } from "./utils/job-progress.js";
import { probeVideoDuration } from "./utils/video.js";
import type { IJobProcessor } from "./services/job-processor.js";
import { openPathInExplorer } from "./utils/open-location.js";
import { writeWav24kMono } from "./utils/audio.js";
import { normalizeApiError } from "./utils/api-error.js";
import { pruneVoicePreviewFiles } from "./utils/voice-preview.js";

interface BuildAppOptions {
  logger: FastifyBaseLogger;
  webOrigins: string[];
  settingsStore: SettingsStore;
  jobsStore: JobsStore;
  usersStore: UsersStore;
  processor: IJobProcessor;
  billingService: BillingService;
  authService: AuthService;
  jobEvents: JobEvents;
  speechGenerator?: {
    generateSpeech: (
      input: GenerateSpeechInput
    ) => Promise<{ data: Buffer; mimeType: string }>;
  };
  probeDuration?: (videoPath: string) => Promise<number>;
  openOutputLocation?: (folderPath: string) => Promise<void>;
  writePreviewAudio?: typeof writeWav24kMono;
  pruneVoicePreviews?: (previewDir: string) => Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyOutput(): JobOutput {
  return {
    artifactPaths: [],
    updatedAt: nowIso()
  };
}

function normalizeRoutePath(input: string | undefined): string {
  if (!input?.trim()) {
    return "/";
  }
  const value = input.trim();
  return value.startsWith("/") ? value : "/";
}

function normalizeJobRecord(job: JobRecord): JobRecord {
  return {
    ...job,
    ownerEmail: job.ownerEmail?.trim().toLowerCase() || undefined,
    progress: job.progress ?? buildProgressFromStatus(job.status),
    output: {
      ...job.output,
      captionPath: job.output.captionPath ?? job.output.scriptPath,
      artifactPaths: [...(job.output.artifactPaths || [])]
    }
  };
}

function normalizeJobOutputForApi(output: JobOutput): JobOutput {
  return {
    ...output,
    captionPath: output.captionPath ?? output.scriptPath
  };
}

function normalizeJobForApi(job: JobRecord): JobRecord {
  const normalized = normalizeJobRecord(job);
  return {
    ...normalized,
    output: normalizeJobOutputForApi(normalized.output)
  };
}

function pickVideoExtension(part: MultipartFile): string {
  const fromName = path.extname(part.filename || "").trim();
  if (fromName) {
    return fromName;
  }
  const fromMime = mime.extension(part.mimetype || "");
  return fromMime ? `.${fromMime}` : ".mp4";
}

function sendNormalizedError(reply: FastifyReply, error: unknown, message: string) {
  const normalized = normalizeApiError(error);
  return reply.code(normalized.statusCode).send({
    message,
    error: normalized.error
  });
}

function createHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function canAccessJob(user: AuthSessionUser, job: JobRecord): boolean {
  if (user.role === "superadmin") {
    return true;
  }
  if (job.ownerUserId) {
    return job.ownerUserId === user.id;
  }
  return Boolean(job.ownerEmail && job.ownerEmail === user.email);
}

function resolveJobOutputFolderPath(job: JobRecord): string {
  const latestOutput = [
    job.output.finalVideoPath,
    job.output.voicePath,
    job.output.captionPath,
    job.output.scriptPath
  ].find(Boolean);
  const absoluteOutput = latestOutput ? outputUrlToAbsolutePath(latestOutput) : undefined;
  return absoluteOutput ? path.dirname(absoluteOutput) : path.join(OUTPUTS_DIR, job.jobId);
}

async function maybeRegisterWebStatic(app: FastifyInstance): Promise<void> {
  try {
    await access(WEB_DIST_DIR);
  } catch {
    return;
  }
  const indexHtml = await readFile(path.join(WEB_DIST_DIR, "index.html"), "utf8");

  await app.register(fastifyStatic, {
    root: WEB_DIST_DIR,
    wildcard: false,
    prefix: "/",
    decorateReply: false
  });

  app.get("/*", async (request, reply) => {
    if (request.url.startsWith("/api") || request.url.startsWith("/outputs")) {
      return reply.code(404).send({ message: "Not found" });
    }
    reply.type("text/html; charset=utf-8");
    return reply.send(indexHtml);
  });
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: options.logger });
  const durationProbe = options.probeDuration ?? probeVideoDuration;
  const openOutputLocation = options.openOutputLocation ?? openPathInExplorer;
  const writePreviewAudio = options.writePreviewAudio ?? writeWav24kMono;
  const pruneVoicePreviews =
    options.pruneVoicePreviews ??
    ((previewDir: string) =>
      pruneVoicePreviewFiles(previewDir, {
        logger: options.logger
      }));

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    try {
      const rawBody = String(body || "");
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      if (parsed && typeof parsed === "object") {
        Object.defineProperty(parsed, "__rawBody", {
          value: rawBody,
          enumerable: false
        });
      }
      done(null, parsed);
    } catch (error) {
      done(error as Error);
    }
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, options.webOrigins.includes(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Signature", "X-Signature"]
  });
  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1
    }
  });
  await app.register(fastifyStatic, {
    root: OUTPUTS_DIR,
    prefix: "/outputs/"
  });
  await maybeRegisterWebStatic(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled API error.");
    return sendNormalizedError(reply, error, "Terjadi kesalahan pada server.");
  });

  const publishJob = (job: JobRecord) => {
    options.jobEvents.publish(normalizeJobForApi(job));
  };

  const publishJobById = async (jobId: string) => {
    const job = await options.jobsStore.getById(jobId);
    if (job) {
      publishJob(job);
    }
  };

  const getRequestAuthContext = async (request: FastifyRequest) => {
    return await options.authService.getSessionContext(request);
  };

  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await getRequestAuthContext(request);
    if (!authContext) {
      reply.code(401).send({ message: "Silakan login terlebih dahulu." });
      return undefined;
    }
    if (authContext.user.disabledAt) {
      reply.code(403).send({
        message: "Akun Anda sedang nonaktif. Hubungi admin untuk mengaktifkan kembali."
      });
      return undefined;
    }
    return authContext;
  };

  const requireSuperadmin = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return undefined;
    }
    if (authContext.user.role !== "superadmin") {
      reply.code(403).send({ message: "Akses hanya untuk superadmin." });
      return undefined;
    }
    return authContext;
  };

  app.get("/api/health", async () => ({
    status: "ok",
    now: nowIso()
  }));

  app.get("/api/auth/session", async (request) => {
    const authContext = await getRequestAuthContext(request);
    return { user: authContext?.user ?? null };
  });

  app.post("/api/auth/register", async (request, reply) => {
    return reply.code(410).send({
      message: "Register sekarang ditangani langsung oleh Supabase Auth di frontend."
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    return reply.code(410).send({
      message: "Login sekarang ditangani langsung oleh Supabase Auth di frontend."
    });
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    return reply.code(410).send({
      message: "Logout sekarang ditangani langsung oleh Supabase Auth di frontend."
    });
  });

  app.get("/api/auth/google/start", async (request, reply) => {
    const query = request.query as { returnTo?: string };
    return reply.code(410).send({
      message: "Google OAuth sekarang dimulai langsung dari Supabase Auth di frontend.",
      returnTo: normalizeRoutePath(query.returnTo)
    });
  });

  app.get("/api/auth/google/callback", async (request, reply) => {
    return reply.code(410).send({
      message: "Callback Google sekarang ditangani langsung oleh Supabase Auth di frontend."
    });
  });

  app.get("/api/billing/wallet", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    try {
      return await options.billingService.getWallet(authContext.user);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memuat saldo deposit.");
    }
  });

  app.post("/api/billing/topups", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const packageCode = String((request.body as { packageCode?: unknown })?.packageCode || "").trim();
    try {
      const topup = await options.billingService.createTopup(authContext.user, packageCode);
      return reply.code(201).send(topup);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal membuat invoice deposit.");
    }
  });

  app.get("/api/billing/topups/:id/status", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const params = request.params as { id: string };
    try {
      return await options.billingService.getTopupStatus(authContext.user, params.id);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal mengecek status deposit.");
    }
  });

  app.post("/api/webhooks/webqris", async (request, reply) => {
    const body = request.body as { __rawBody?: string } | undefined;
    const rawBody = body?.__rawBody ?? JSON.stringify(request.body ?? {});
    const signatureHeader = request.headers["x-webhook-signature"] || request.headers["x-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader || "";
    try {
      return await options.billingService.handleWebhook(rawBody, String(signature));
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memproses webhook WebQRIS.");
    }
  });

  app.get("/api/admin/users", async (request, reply) => {
    const authContext = await requireSuperadmin(request, reply);
    if (!authContext) {
      return;
    }
    return await options.usersStore.list(authContext.db);
  });

  app.post("/api/admin/users", async (request, reply) => {
    const authContext = await requireSuperadmin(request, reply);
    if (!authContext) {
      return;
    }

    let payload;
    try {
      payload = parseAdminUserCreateInput(request.body);
    } catch (error) {
      return sendNormalizedError(reply, error, "Data user baru tidak valid.");
    }

    const existing = await options.usersStore.getByEmail(payload.email);
    if (existing) {
      return reply.code(409).send({ message: "Email sudah terdaftar." });
    }

    try {
      let userId = nanoid(12);
      const adminClient = options.authService.adminClient;
      if (adminClient?.auth?.admin) {
        const { data, error } = await adminClient.auth.admin.createUser({
          email: payload.email,
          password: payload.password,
          email_confirm: true,
          user_metadata: {
            display_name: payload.displayName || payload.email.split("@")[0]
          }
        });
        if (error || !data.user?.id) {
          throw error ?? new Error("User baru tidak dapat dibuat.");
        }
        userId = data.user.id;
      }

      const now = nowIso();
      const created = await options.usersStore.upsert(
        {
          id: userId,
          email: payload.email,
          displayName: payload.displayName || payload.email.split("@")[0] || payload.email,
          role: payload.role,
          subscriptionStatus: payload.subscriptionStatus,
          videoQuotaTotal: 0,
          videoQuotaUsed: 0,
          walletBalanceIdr: 0,
          isUnlimited: payload.isUnlimited,
          disabledAt: null,
          disabledReason: null,
          assignedPackageCode: null,
          googleLinked: false,
          hasPassword: true,
          createdAt: now,
          updatedAt: now
        },
      );

      return reply.code(201).send(created);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal membuat user baru.");
    }
  });

  app.patch("/api/admin/users/:userEmail", async (request, reply) => {
    const authContext = await requireSuperadmin(request, reply);
    if (!authContext) {
      return;
    }

    let payload;
    try {
      payload = parseAdminUserUpdateInput(request.body);
    } catch (error) {
      return sendNormalizedError(reply, error, "Data update user tidak valid.");
    }

    const params = request.params as { userEmail: string };
    const userEmail = decodeURIComponent(params.userEmail || "").trim().toLowerCase();
    try {
      const updated = await options.usersStore.update(
        userEmail,
        (current) => ({
          ...current,
          displayName: payload.displayName ?? current.displayName,
          role: payload.role ?? current.role,
          subscriptionStatus: payload.subscriptionStatus ?? current.subscriptionStatus,
          isUnlimited: payload.isUnlimited ?? current.isUnlimited,
          disabledAt:
            payload.disabled === true
              ? nowIso()
              : payload.disabled === false
                ? null
                : current.disabledAt ?? null,
          disabledReason:
            payload.disabled === true
              ? payload.disabledReason || "Dinonaktifkan oleh admin"
              : payload.disabled === false
                ? null
                : payload.disabledReason ?? current.disabledReason ?? null,
          assignedPackageCode:
            payload.assignedPackageCode === undefined
              ? current.assignedPackageCode ?? null
              : payload.assignedPackageCode,
          videoQuotaTotal: payload.videoQuotaTotal ?? current.videoQuotaTotal,
          videoQuotaUsed: payload.videoQuotaUsed ?? current.videoQuotaUsed,
          updatedAt: nowIso()
        }),
        authContext.db
      );

      if (!updated) {
        return reply.code(404).send({ message: "User tidak ditemukan." });
      }

      return reply.send(updated);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memperbarui user.");
    }
  });

  app.delete("/api/admin/users/:userEmail", async (request, reply) => {
    const authContext = await requireSuperadmin(request, reply);
    if (!authContext) {
      return;
    }

    const params = request.params as { userEmail: string };
    const userEmail = decodeURIComponent(params.userEmail || "").trim().toLowerCase();
    if (userEmail === "jho.j80@gmail.com") {
      return reply.code(400).send({ message: "User whitelist utama tidak bisa dinonaktifkan." });
    }

    try {
      const updated = await options.usersStore.update(
        userEmail,
        (current) => ({
          ...current,
          subscriptionStatus: "inactive",
          disabledAt: nowIso(),
          disabledReason: "Dinonaktifkan oleh admin",
          updatedAt: nowIso()
        }),
        authContext.db
      );

      if (!updated) {
        return reply.code(404).send({ message: "User tidak ditemukan." });
      }

      return reply.send(updated);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal menonaktifkan user.");
    }
  });

  app.post("/api/admin/users/:userEmail/package-grants", async (request, reply) => {
    const authContext = await requireSuperadmin(request, reply);
    if (!authContext) {
      return;
    }

    let payload;
    try {
      payload = parseAdminPackageGrantInput(request.body);
    } catch (error) {
      return sendNormalizedError(reply, error, "Data paket tidak valid.");
    }

    const packageInfo = payload.packageCode === "custom" ? undefined : getDepositPackage(payload.packageCode);
    const amountIdr = payload.packageCode === "custom" ? payload.customAmountIdr ?? 0 : packageInfo?.creditAmountIdr ?? 0;
    const description =
      payload.description ||
      (packageInfo
        ? `Assign paket ${packageInfo.label} oleh admin`
        : "Penyesuaian saldo custom oleh admin");
    const params = request.params as { userEmail: string };
    const userEmail = decodeURIComponent(params.userEmail || "").trim().toLowerCase();

    try {
      const updated = await options.usersStore.grantWalletCredit(
        userEmail,
        {
          amountIdr,
          packageCode: payload.packageCode,
          actorEmail: authContext.user.email,
          description
        },
        authContext.db
      );

      if (!updated) {
        return reply.code(404).send({ message: "User tidak ditemukan." });
      }

      return reply.code(201).send(updated);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal menambahkan saldo user.");
    }
  });

  app.get("/api/settings", async (request, reply) => {
    const authContext = await requireSuperadmin(request, reply);
    if (!authContext) {
      return;
    }
    try {
      return await options.settingsStore.get(authContext.db);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memuat settings.");
    }
  });

  app.put("/api/settings", async (request, reply) => {
    const authContext = await requireSuperadmin(request, reply);
    if (!authContext) {
      return;
    }
    let parsed;
    try {
      parsed = parseSettings(request.body);
    } catch (error) {
      return sendNormalizedError(reply, error, "Pengaturan tidak valid.");
    }

    try {
      await options.settingsStore.set(parsed, authContext.db);
      return reply.send(parsed);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal menyimpan pengaturan.");
    }
  });

  app.get("/api/tts/voices", async () => {
    return {
      voices: GEMINI_TTS_VOICES,
      excitedPresets: GEMINI_EXCITED_PRESETS
    };
  });

  app.post("/api/tts/preview", async (request, reply) => {
    if (!options.speechGenerator) {
      return reply.code(503).send({
        message: "Speech generator tidak tersedia di server."
      });
    }

    let payload;
    try {
      payload = parseTtsPreviewInput(request.body);
    } catch (error) {
      return sendNormalizedError(reply, error, "Input preview voice tidak valid.");
    }

    const voice = findTtsVoiceByName(payload.voiceName);
    if (!voice) {
      return reply.code(400).send({
        message: `Voice ${payload.voiceName} tidak tersedia.`
      });
    }

    try {
      const settings = await options.settingsStore.get();
      const sampleText =
        payload.text ||
        "Ini contoh voice over general untuk video short maksimal 60 detik dengan delivery natural dan jelas.";
      const audio = await options.speechGenerator.generateSpeech({
        model: settings.ttsModel,
        text: sampleText,
        voiceName: voice.voiceName,
        speechRate: payload.speechRate
      });

      const previewDir = path.join(OUTPUTS_DIR, "_voice_previews");
      await mkdir(previewDir, { recursive: true });
      await pruneVoicePreviews(previewDir).catch((error) => {
        options.logger.warn({ err: error, previewDir }, "Gagal prune preview voice lama.");
      });
      const filename = `${Date.now()}-${voice.voiceName}-${nanoid(5)}.wav`;
      const outputPath = path.join(previewDir, filename);
      await writePreviewAudio(audio.data, audio.mimeType, outputPath, payload.speechRate);

      return reply.send({
        voiceName: voice.voiceName,
        previewPath: `/outputs/_voice_previews/${filename}`
      });
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal membuat preview voice.");
    }
  });

  app.get("/api/jobs", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    try {
      return (await options.jobsStore.list(authContext.db))
        .filter((job) => canAccessJob(authContext.user, job))
        .map(normalizeJobForApi);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memuat daftar job.");
    }
  });

  app.get("/api/generation-capacity", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    return options.processor.getCapacitySnapshot();
  });

  app.get("/api/jobs/:jobId", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const params = request.params as { jobId: string };
    let job;
    try {
      job = await options.jobsStore.getById(params.jobId, authContext.db);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memuat detail job.");
    }
    if (!job) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (!canAccessJob(authContext.user, job)) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    return normalizeJobForApi(job);
  });

  app.get("/api/jobs/:jobId/events", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }

    const params = request.params as { jobId: string };
    const job = await options.jobsStore.getById(params.jobId, authContext.db);
    if (!job || !canAccessJob(authContext.user, job)) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });

    const writeEvent = (nextJob: JobRecord) => {
      reply.raw.write(`event: job\ndata: ${JSON.stringify({ job: normalizeJobForApi(nextJob) })}\n\n`);
    };

    writeEvent(job);
    const unsubscribe = options.jobEvents.subscribe(params.jobId, writeEvent);
    const heartbeat = setInterval(() => {
      reply.raw.write(": keep-alive\n\n");
    }, 15000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });

    return reply;
  });

  app.put("/api/jobs/:jobId", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const params = request.params as { jobId: string };
    let job;
    try {
      job = await options.jobsStore.getById(params.jobId, authContext.db);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memuat job.");
    }
    if (!job) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (!canAccessJob(authContext.user, job)) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (!JobsStore.isEditable(job.status)) {
      return reply.code(409).send({
        message: "Job hanya bisa diedit saat status queued, failed, atau interrupted."
      });
    }

    let payload;
    try {
      payload = parseJobUpdateInput(request.body);
    } catch (error) {
      return sendNormalizedError(reply, error, "Data job tidak valid.");
    }

    try {
      const updated = await options.jobsStore.update(
        params.jobId,
        (current) => ({
          ...current,
          title: payload.title,
          description: payload.description,
          hashtagHints: payload.hashtagHints,
          contentType: payload.contentType,
          voiceGender: payload.voiceGender,
          tone: payload.tone,
          ctaText: payload.ctaText,
          referenceLink: payload.referenceLink,
          updatedAt: nowIso()
        }),
        authContext.db
      );

      if (!updated) {
        return reply.code(404).send({ message: "Job tidak ditemukan." });
      }

      publishJob(updated);
      return reply.send(normalizeJobForApi(updated));
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memperbarui job.");
    }
  });

  app.delete("/api/jobs/:jobId", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const params = request.params as { jobId: string };
    let job;
    try {
      job = await options.jobsStore.getById(params.jobId, authContext.db);
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal memuat job.");
    }
    if (!job) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (!canAccessJob(authContext.user, job)) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (job.status === "running") {
      return reply.code(409).send({
        message: "Job dengan status running tidak bisa dihapus."
      });
    }

    try {
      const removed = await options.jobsStore.delete(params.jobId, authContext.db);
      if (!removed) {
        return reply.code(404).send({ message: "Job tidak ditemukan." });
      }
      options.processor.removeQueuedJob(params.jobId);
      return reply.send({ ok: true });
    } catch (error) {
      return sendNormalizedError(reply, error, "Gagal menghapus job.");
    }
  });

  app.post("/api/jobs/:jobId/retry", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const params = request.params as { jobId: string };
    const job = await options.jobsStore.getById(params.jobId, authContext.db);
    if (!job) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (!canAccessJob(authContext.user, job)) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (!JobsStore.isRetryable(job.status)) {
      return reply.code(400).send({
        message: "Retry hanya untuk job dengan status failed atau interrupted."
      });
    }

    const capacity = options.processor.getCapacitySnapshot();
    if (capacity.overloaded) {
      return reply.code(503).send({ message: capacity.message });
    }

    const updated = await options.jobsStore.update(
      params.jobId,
      (current) => ({
        ...current,
        updatedAt: nowIso(),
        status: "queued",
        progress: buildJobProgress("queued"),
        errorMessage: undefined,
        output: createEmptyOutput()
      }),
      authContext.db
    );

    if (!updated) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }

    const ownerKey = updated.ownerUserId ?? updated.ownerEmail;
    const enqueued = options.processor.enqueue(params.jobId, ownerKey);
    if (!enqueued) {
      await options.jobsStore.update(
        params.jobId,
        () => ({
          ...job,
          updatedAt: nowIso()
        }),
        authContext.db
      );
      await publishJobById(params.jobId);
      return reply.code(503).send({
        message: options.processor.getCapacitySnapshot().message
      });
    }

    await publishJobById(params.jobId);
    return reply.send({ ok: true });
  });

  app.post("/api/jobs/:jobId/open-location", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const params = request.params as { jobId: string };
    const job = await options.jobsStore.getById(params.jobId, authContext.db);
    if (!job) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }
    if (!canAccessJob(authContext.user, job)) {
      return reply.code(404).send({ message: "Job tidak ditemukan." });
    }

    const outputDir = resolveJobOutputFolderPath(normalizeJobForApi(job));
    try {
      await mkdir(outputDir, { recursive: true });
      await openOutputLocation(outputDir);
      return reply.send({ ok: true, folderPath: outputDir });
    } catch (error) {
      return reply.code(500).send({
        message: "Gagal membuka lokasi file.",
        error: (error as { message?: string })?.message
      });
    }
  });

  app.post("/api/jobs", async (request, reply) => {
    const authContext = await requireAuth(request, reply);
    if (!authContext) {
      return;
    }
    const parts = (
      request as unknown as {
        parts: () => AsyncIterable<MultipartFile | any>;
      }
    ).parts();
    const inputFields: Record<string, string | undefined> = {};
    let videoPath = "";
    let videoMimeType = "video/mp4";
    let uploadDir = "";
    const jobId = nanoid(10);
    let keepUploadDir = false;
    let creditReserved = false;

    const cleanupUploadDir = async () => {
      if (!uploadDir) {
        return;
      }
      const currentUploadDir = uploadDir;
      uploadDir = "";
      await rm(currentUploadDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50
      });
    };

    try {
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "video") {
          uploadDir = path.join(UPLOADS_DIR, jobId);
          await mkdir(uploadDir, { recursive: true });
          const extension = pickVideoExtension(part);
          videoPath = path.join(uploadDir, `source${extension}`);
          videoMimeType = part.mimetype || "video/mp4";
          await pipeline(part.file, createWriteStream(videoPath));
          continue;
        }

        if (part.type === "field") {
          inputFields[part.fieldname] = String(part.value || "").trim();
        }

        if (part.type === "file") {
          part.file.resume();
        }
      }

      if (!videoPath) {
        return reply.code(400).send({ message: "File video wajib diisi." });
      }

      let payload;
      try {
        payload = parseJobCreateInput(inputFields);
      } catch (error) {
        return sendNormalizedError(reply, error, "Field job tidak valid.");
      }

      const settings = await options.settingsStore.get(authContext.db);
      const durationSec = await durationProbe(videoPath);
      if (durationSec > settings.maxVideoSeconds) {
        return reply.code(400).send({
          message: `Durasi video ${durationSec.toFixed(2)}s melebihi batas ${settings.maxVideoSeconds}s.`
        });
      }

      const capacity = options.processor.getCapacitySnapshot();
      if (capacity.overloaded) {
        return reply.code(503).send({
          message: capacity.message
        });
      }

      await options.usersStore.reserveGenerateCredit(jobId, authContext.user.email);
      creditReserved = true;

      const now = nowIso();
      const job: JobRecord = {
        jobId,
        createdAt: now,
        updatedAt: now,
        ownerUserId: authContext.user.id,
        ownerEmail: authContext.user.email,
        title: payload.title,
        description: payload.description,
        hashtagHints: payload.hashtagHints,
        contentType: payload.contentType,
        voiceGender: payload.voiceGender,
        tone: payload.tone,
        ctaText: payload.ctaText,
        referenceLink: payload.referenceLink,
        videoPath,
        videoMimeType,
        videoDurationSec: durationSec,
        status: "queued",
        progress: buildJobProgress("queued"),
        output: createEmptyOutput()
      };
      await options.jobsStore.create(job, authContext.db);
      const ownerKey = job.ownerUserId ?? job.ownerEmail;
      const enqueued = options.processor.enqueue(jobId, ownerKey);
      if (!enqueued) {
        await options.jobsStore.delete(jobId, authContext.db).catch(() => false);
        throw createHttpError(503, options.processor.getCapacitySnapshot().message);
      }
      keepUploadDir = true;
      publishJob(job);

      return reply.code(202).send({
        jobId,
        status: "queued",
        progress: job.progress
      });
    } catch (error) {
      if (creditReserved) {
        await options.usersStore
          .refundGenerateCredit(jobId, authContext.user.email, "Refund karena job gagal dibuat")
          .catch(() => undefined);
      }
      if (!keepUploadDir) {
        await cleanupUploadDir();
      }
      return sendNormalizedError(reply, error, "Gagal memproses upload video.");
    } finally {
      if (!keepUploadDir) {
        await cleanupUploadDir();
      }
    }
  });

  return app;
}
