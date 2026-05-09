import type { AuthUser, JobRecord } from "./types";

export interface GenerateBlocker {
  type: "active-job" | "pending-download";
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

export function isJobPendingRequiredDownloads(job: JobRecord): boolean {
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

export function isJobFullyDownloaded(job: JobRecord): boolean {
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

function getOwnJobs(currentUser: AuthUser, jobs: JobRecord[]): JobRecord[] {
  if (currentUser.role !== "superadmin") {
    return jobs;
  }

  const currentEmail = normalizeEmail(currentUser.email);
  return jobs.filter((job) => normalizeEmail(job.ownerEmail) === currentEmail);
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
    return "Job sebelumnya sudah selesai. Unduh caption dan final video terlebih dahulu dari halaman Riwayat sebelum membuat job baru.";
  }
  if (needsCaption) {
    return "Job sebelumnya sudah selesai. Unduh caption terlebih dahulu dari halaman Riwayat sebelum membuat job baru.";
  }
  return "Job sebelumnya sudah selesai. Unduh final video terlebih dahulu dari halaman Riwayat sebelum membuat job baru.";
}

export function getGenerateBlocker(
  currentUser: AuthUser,
  jobs: JobRecord[]
): GenerateBlocker | undefined {
  const ownJobs = getOwnJobs(currentUser, jobs).sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

  const activeJob = ownJobs.find((job) => job.status === "queued" || job.status === "running");
  if (activeJob) {
    return {
      type: "active-job",
      jobId: activeJob.jobId,
      message:
        "Masih ada job sebelumnya yang sedang antre atau diproses. Tunggu sampai selesai terlebih dahulu sebelum membuat job baru."
    };
  }

  const pendingDownloadJob = ownJobs.find((job) => isJobPendingRequiredDownloads(job));
  if (!pendingDownloadJob) {
    return undefined;
  }

  return {
    type: "pending-download",
    jobId: pendingDownloadJob.jobId,
    message: buildPendingDownloadMessage(pendingDownloadJob)
  };
}
