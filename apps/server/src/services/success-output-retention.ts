import type { FastifyBaseLogger } from "fastify";
import { JobsStore } from "../stores/jobs-store.js";
import type { JobRecord } from "../types.js";
import { isDownloadPendingJob, isFullyDownloadedSuccessJob } from "../utils/job-download-policy.js";

export const DEFAULT_SUCCESS_OUTPUT_RETENTION_HOURS = 72;
export const SUCCESS_OUTPUT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export function normalizeSuccessOutputRetentionHours(value: string | number | undefined): number {
  const normalized = typeof value === "number" ? value : value ? Number(value) : NaN;
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return DEFAULT_SUCCESS_OUTPUT_RETENTION_HOURS;
  }
  return normalized;
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getSuccessJobRetentionBaseMs(job: Pick<JobRecord, "createdAt" | "updatedAt" | "output">): number {
  return Math.max(
    parseTimestamp(job.output.updatedAt) ?? 0,
    parseTimestamp(job.updatedAt) ?? 0,
    parseTimestamp(job.createdAt) ?? 0
  );
}

export function isPendingSuccessJobExpired(
  job: JobRecord,
  options?: {
    nowMs?: number;
    retentionHours?: number;
  }
): boolean {
  if (!isDownloadPendingJob(job) || isFullyDownloadedSuccessJob(job)) {
    return false;
  }

  const retentionHours = normalizeSuccessOutputRetentionHours(options?.retentionHours);
  const cutoffMs = (options?.nowMs ?? Date.now()) - retentionHours * 60 * 60 * 1000;
  return getSuccessJobRetentionBaseMs(job) <= cutoffMs;
}

export class SuccessOutputRetentionSweeper {
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly jobsStore: JobsStore,
    private readonly logger: FastifyBaseLogger,
    private readonly retentionHours = DEFAULT_SUCCESS_OUTPUT_RETENTION_HOURS,
    private readonly intervalMs = SUCCESS_OUTPUT_SWEEP_INTERVAL_MS
  ) {}

  public async sweepOnce(nowMs = Date.now()): Promise<number> {
    const jobs = await this.jobsStore.list();
    const expiredJobs = jobs.filter((job) =>
      isPendingSuccessJobExpired(job, {
        nowMs,
        retentionHours: this.retentionHours
      })
    );

    if (!expiredJobs.length) {
      return 0;
    }

    let deletedCount = 0;
    for (const job of expiredJobs) {
      try {
        const deleted = await this.jobsStore.delete(job.jobId);
        if (deleted) {
          deletedCount += 1;
        }
      } catch (error) {
        this.logger.warn(
          {
            err: error,
            retentionHours: this.retentionHours,
            jobId: job.jobId
          },
          "Gagal menghapus output sukses lama."
        );
      }
    }

    if (deletedCount > 0) {
      this.logger.info(
        {
          deletedCount,
          retentionHours: this.retentionHours
        },
        "Pembersihan output sukses lama selesai."
      );
    }

    return deletedCount;
  }

  public start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.sweepOnce().catch((error) => {
        this.logger.warn({ err: error }, "Sweeper output sukses lama gagal dijalankan.");
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
