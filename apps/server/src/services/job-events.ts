import type { JobRecord } from "../types.js";

export type JobListener = (job: JobRecord) => void;

export class JobEvents {
  private readonly listeners = new Map<string, Set<JobListener>>();

  public subscribe(jobId: string, listener: JobListener): () => void {
    const current = this.listeners.get(jobId) ?? new Set<JobListener>();
    current.add(listener);
    this.listeners.set(jobId, current);

    return () => {
      const next = this.listeners.get(jobId);
      if (!next) {
        return;
      }
      next.delete(listener);
      if (next.size === 0) {
        this.listeners.delete(jobId);
      }
    };
  }

  public publish(job: JobRecord): void {
    const current = this.listeners.get(job.jobId);
    if (!current?.size) {
      return;
    }

    for (const listener of [...current]) {
      listener(job);
    }
  }
}
