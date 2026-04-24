import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { MAX_HISTORY } from "../constants.js";
import type { JobRecord, JobStatus } from "../types.js";
import { JsonFile } from "../utils/json-file.js";
import { JOBS_FILE, UPLOADS_DIR, outputUrlToAbsolutePath } from "../utils/paths.js";

function nowIso(): string {
  return new Date().toISOString();
}

function listOutputArtifacts(job: JobRecord): string[] {
  const files = new Set<string>();
  for (const output of [
    ...(job.output.artifactPaths || []),
    job.output.captionPath,
    job.output.scriptPath,
    job.output.voicePath,
    job.output.finalVideoPath
  ]) {
    if (!output) {
      continue;
    }
    const absolutePath = outputUrlToAbsolutePath(output);
    if (absolutePath) {
      files.add(absolutePath);
    }
  }
  return [...files];
}

function listOutputDirectories(job: JobRecord): string[] {
  const directories = new Set<string>();
  for (const filePath of listOutputArtifacts(job)) {
    directories.add(path.dirname(filePath));
  }
  return [...directories];
}

export class JobsStore {
  private readonly file = new JsonFile<JobRecord[]>(JOBS_FILE, []);

  public async list(): Promise<JobRecord[]> {
    return await this.file.get();
  }

  public async getById(jobId: string): Promise<JobRecord | undefined> {
    const jobs = await this.file.get();
    return jobs.find((job) => job.jobId === jobId);
  }

  public async create(job: JobRecord): Promise<JobRecord> {
    await this.file.update(async (jobs) => {
      const next = [job, ...jobs];
      const removed = next.slice(MAX_HISTORY);
      const kept = next.slice(0, MAX_HISTORY);
      await Promise.all(removed.map((item) => this.cleanupJobArtifacts(item)));
      return kept;
    });
    return job;
  }

  public async update(
    jobId: string,
    updater: (job: JobRecord) => JobRecord
  ): Promise<JobRecord | undefined> {
    let updated: JobRecord | undefined;
    await this.file.update((jobs) => {
      const next = [...jobs];
      const index = next.findIndex((job) => job.jobId === jobId);
      if (index < 0) {
        return jobs;
      }
      const current = next[index];
      if (!current) {
        return jobs;
      }
      updated = updater({
        ...current,
        output: {
          ...current.output,
          captionPath: current.output.captionPath ?? current.output.scriptPath,
          artifactPaths: [...(current.output.artifactPaths || [])]
        }
      });
      if (updated) {
        next[index] = updated;
      }
      return next;
    });
    return updated;
  }

  public async delete(jobId: string): Promise<boolean> {
    let removed: JobRecord | undefined;
    await this.file.update((jobs) => {
      const next = jobs.filter((job) => {
        if (job.jobId === jobId) {
          removed = job;
          return false;
        }
        return true;
      });
      return next;
    });

    if (removed) {
      await this.cleanupJobArtifacts(removed);
      return true;
    }

    return false;
  }

  public async markRunningAsInterrupted(): Promise<void> {
    await this.file.update((jobs) =>
      jobs.map((job) =>
        job.status === "running"
          ? {
              ...job,
              updatedAt: nowIso(),
              status: "interrupted",
              errorMessage: "Server restart saat job berjalan.",
              output: {
                ...job.output,
                captionPath: job.output.captionPath ?? job.output.scriptPath,
                updatedAt: nowIso()
              }
            }
          : job
      )
    );
  }

  public static isEditable(status: JobStatus): boolean {
    return ["queued", "failed", "interrupted"].includes(status);
  }

  public static isRetryable(status: JobStatus): boolean {
    return ["failed", "interrupted"].includes(status);
  }

  private async cleanupJobArtifacts(job: JobRecord): Promise<void> {
    await Promise.all(
      listOutputArtifacts(job).map((filePath) => rm(filePath, { recursive: false, force: true }))
    );

    await rm(path.join(UPLOADS_DIR, job.jobId), { recursive: true, force: true });

    for (const directory of listOutputDirectories(job)) {
      try {
        const entries = await readdir(directory);
        if (entries.length === 0) {
          await rm(directory, { recursive: false, force: true });
        }
      } catch {
        // Ignore cleanup errors for empty folder removal.
      }
    }
  }
}
