import type { JobStatus } from "../types";

const palette: Record<JobStatus, string> = {
  queued: "status status-queued",
  running: "status status-running",
  success: "status status-success",
  failed: "status status-failed",
  interrupted: "status status-interrupted"
};

const label: Record<JobStatus, string> = {
  queued: "queued",
  running: "running",
  success: "success",
  failed: "failed",
  interrupted: "interrupted"
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={palette[status] || "status"}>{label[status] || status}</span>;
}
