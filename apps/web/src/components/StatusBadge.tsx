import type { JobStatus } from "../types";

const palette: Record<JobStatus, string> = {
  queued: "status status-queued",
  running: "status status-running",
  success: "status status-success",
  failed: "status status-failed",
  interrupted: "status status-interrupted"
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={palette[status] || "status"}>{status}</span>;
}
