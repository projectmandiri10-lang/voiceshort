import type { SupabaseClient } from "@supabase/supabase-js";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { MAX_HISTORY } from "../constants.js";
import type { JobRecord, JobStatus } from "../types.js";
import { JsonFile } from "../utils/json-file.js";
import { buildProgressFromStatus } from "../utils/job-progress.js";
import { JOBS_FILE, UPLOADS_DIR, outputUrlToAbsolutePath } from "../utils/paths.js";
import type { JobRow } from "../services/supabase-schema.js";
import { jobRecordToRow, jobRowToRecord } from "../services/supabase-schema.js";

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

function normalizeStoredJob(job: JobRecord): JobRecord {
  return {
    ...job,
    ownerUserId: job.ownerUserId?.trim() || undefined,
    ownerEmail: job.ownerEmail?.trim().toLowerCase() || undefined,
    progress: job.progress ?? buildProgressFromStatus(job.status),
    output: {
      ...job.output,
      captionPath: job.output.captionPath ?? job.output.scriptPath,
      artifactPaths: [...(job.output.artifactPaths || [])]
    }
  };
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

  public constructor(private readonly adminClient?: SupabaseClient) {}

  public async list(client?: SupabaseClient): Promise<JobRecord[]> {
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      return (data || []).map((row) => normalizeStoredJob(jobRowToRecord(row as JobRow)));
    }
    return (await this.file.get()).map(normalizeStoredJob);
  }

  public async getById(jobId: string, client?: SupabaseClient): Promise<JobRecord | undefined> {
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db.from("jobs").select("*").eq("job_id", jobId).maybeSingle();
      if (error) {
        throw error;
      }
      return data ? normalizeStoredJob(jobRowToRecord(data as JobRow)) : undefined;
    }
    const jobs = await this.file.get();
    const job = jobs.find((entry) => entry.jobId === jobId);
    return job ? normalizeStoredJob(job) : undefined;
  }

  public async create(job: JobRecord, client?: SupabaseClient): Promise<JobRecord> {
    const normalized = normalizeStoredJob(job);
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db.from("jobs").insert(jobRecordToRow(normalized)).select("*").single();
      if (error) {
        throw error;
      }
      return normalizeStoredJob(jobRowToRecord(data as JobRow));
    }

    await this.file.update(async (jobs) => {
      const next = [normalized, ...jobs.map(normalizeStoredJob)];
      const removed = next.slice(MAX_HISTORY);
      const kept = next.slice(0, MAX_HISTORY);
      await Promise.all(removed.map((item) => this.cleanupJobArtifacts(item)));
      return kept;
    });
    return normalized;
  }

  public async update(
    jobId: string,
    updater: (job: JobRecord) => JobRecord,
    client?: SupabaseClient
  ): Promise<JobRecord | undefined> {
    const current = await this.getById(jobId, client);
    if (!current) {
      return undefined;
    }
    const updatedRecord = normalizeStoredJob(updater(current));
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db
        .from("jobs")
        .update(jobRecordToRow(updatedRecord))
        .eq("job_id", jobId)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return normalizeStoredJob(jobRowToRecord(data as JobRow));
    }

    let updated: JobRecord | undefined;
    await this.file.update((jobs) => {
      const next = [...jobs.map(normalizeStoredJob)];
      const index = next.findIndex((storedJob) => storedJob.jobId === jobId);
      if (index < 0) {
        return jobs;
      }
      updated = updatedRecord;
      next[index] = updatedRecord;
      return next;
    });
    return updated;
  }

  public async delete(jobId: string, client?: SupabaseClient): Promise<boolean> {
    const db = client ?? this.adminClient;
    if (db) {
      const current = await this.getById(jobId, client);
      if (!current) {
        return false;
      }
      const { error } = await db.from("jobs").delete().eq("job_id", jobId);
      if (error) {
        throw error;
      }
      await this.cleanupJobArtifacts(current);
      return true;
    }

    let removed: JobRecord | undefined;
    await this.file.update((jobs) => {
      const next = jobs.map(normalizeStoredJob).filter((job) => {
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
    const db = this.adminClient;
    if (db) {
      const runningJobs = await this.list(db);
      await Promise.all(
        runningJobs
          .filter((job) => job.status === "running")
          .map((job) =>
            this.update(
              job.jobId,
              (current) => ({
                ...current,
                updatedAt: nowIso(),
                status: "interrupted",
                errorMessage: "Server restart saat job berjalan.",
                output: {
                  ...current.output,
                  captionPath: current.output.captionPath ?? current.output.scriptPath,
                  updatedAt: nowIso()
                }
              }),
              db
            )
          )
      );
      return;
    }

    await this.file.update((jobs) =>
      jobs.map(normalizeStoredJob).map((job) =>
        job.status === "running"
          ? {
              ...job,
              updatedAt: nowIso(),
              status: "interrupted",
              progressLabel: "Generate voice over terhenti karena server restart.",
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
