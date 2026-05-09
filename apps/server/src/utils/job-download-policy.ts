import type { AuthSessionUser, JobRecord } from "../types.js";

export type JobCreateBlockerType = "active-job" | "pending-download";

export interface JobCreateBlocker {
  type: JobCreateBlockerType;
  jobId: string;
  message: string;
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function getCaptionArtifactPath(job: Pick<JobRecord, "output">): string | undefined {
  return job.output.captionPath || job.output.scriptPath;
}

export function isCaptionDownloadComplete(job: Pick<JobRecord, "output">): boolean {
  return Boolean(getCaptionArtifactPath(job) && job.output.captionDownloadedAt);
}

export function isFinalVideoDownloadComplete(job: Pick<JobRecord, "output">): boolean {
  return Boolean(job.output.finalVideoPath && job.output.finalVideoDownloadedAt);
}

export function isDownloadPendingJob(job: JobRecord): boolean {
  if (job.status !== "success") {
    return false;
  }

  const captionPath = getCaptionArtifactPath(job);
  const finalVideoPath = job.output.finalVideoPath;
  if (!captionPath || !finalVideoPath) {
    return true;
  }

  return !job.output.captionDownloadedAt || !job.output.finalVideoDownloadedAt;
}

export function isFullyDownloadedSuccessJob(job: JobRecord): boolean {
  if (job.status !== "success") {
    return false;
  }

  const captionPath = getCaptionArtifactPath(job);
  const finalVideoPath = job.output.finalVideoPath;
  return Boolean(
    captionPath &&
      finalVideoPath &&
      job.output.captionDownloadedAt &&
      job.output.finalVideoDownloadedAt
  );
}

export function jobBelongsToUser(user: AuthSessionUser, job: JobRecord): boolean {
  if (job.ownerUserId) {
    return job.ownerUserId === user.id;
  }

  const ownerEmail = normalizeEmail(job.ownerEmail);
  return Boolean(ownerEmail && ownerEmail === normalizeEmail(user.email));
}

export function getOwnedJobs(user: AuthSessionUser, jobs: JobRecord[]): JobRecord[] {
  return jobs.filter((job) => jobBelongsToUser(user, job));
}

function buildPendingDownloadMessage(job: JobRecord): string {
  const captionPath = getCaptionArtifactPath(job);
  const finalVideoPath = job.output.finalVideoPath;

  if (!captionPath && !finalVideoPath) {
    return "Job sebelumnya selesai, tetapi file caption dan final video tidak tersedia. Hubungi admin untuk recovery.";
  }
  if (!captionPath) {
    return "Job sebelumnya selesai, tetapi file caption tidak tersedia. Hubungi admin untuk recovery.";
  }
  if (!finalVideoPath) {
    return "Job sebelumnya selesai, tetapi file final video tidak tersedia. Hubungi admin untuk recovery.";
  }

  const needsCaption = !job.output.captionDownloadedAt;
  const needsFinalVideo = !job.output.finalVideoDownloadedAt;

  if (needsCaption && needsFinalVideo) {
    return "Job sebelumnya sudah selesai. Unduh caption dan final video terlebih dahulu sebelum membuat job baru.";
  }
  if (needsCaption) {
    return "Job sebelumnya sudah selesai. Unduh caption terlebih dahulu sebelum membuat job baru.";
  }
  return "Job sebelumnya sudah selesai. Unduh final video terlebih dahulu sebelum membuat job baru.";
}

export function getCreateJobBlocker(
  user: AuthSessionUser,
  jobs: JobRecord[]
): JobCreateBlocker | undefined {
  const ownedJobs = getOwnedJobs(user, jobs).sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

  const activeJob = ownedJobs.find((job) => job.status === "queued" || job.status === "running");
  if (activeJob) {
    return {
      type: "active-job",
      jobId: activeJob.jobId,
      message:
        "Masih ada job sebelumnya yang sedang antre atau diproses. Tunggu sampai selesai terlebih dahulu sebelum membuat job baru."
    };
  }

  const pendingDownloadJob = ownedJobs.find((job) => isDownloadPendingJob(job));
  if (!pendingDownloadJob) {
    return undefined;
  }

  return {
    type: "pending-download",
    jobId: pendingDownloadJob.jobId,
    message: buildPendingDownloadMessage(pendingDownloadJob)
  };
}
