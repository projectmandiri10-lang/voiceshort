import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, XCircle } from "lucide-react";
import type { JobStatus } from "../types";

const palette: Record<JobStatus, string> = {
  queued: "status-badge status-queued",
  running: "status-badge status-running",
  success: "status-badge status-success",
  failed: "status-badge status-failed",
  interrupted: "status-badge status-interrupted",
};

const label: Record<JobStatus, string> = {
  queued: "Antri",
  running: "Berjalan",
  success: "Selesai",
  failed: "Gagal",
  interrupted: "Terhenti",
};

const icon = {
  queued: Clock3,
  running: LoaderCircle,
  success: CheckCircle2,
  failed: XCircle,
  interrupted: AlertTriangle,
} satisfies Record<JobStatus, typeof Clock3>;

export function StatusBadge({ status }: { status: JobStatus }) {
  const Icon = icon[status] || Clock3;

  return (
    <span className={palette[status] || "status-badge status-queued"}>
      <Icon size={14} strokeWidth={2.2} className={status === "running" ? "animate-spin" : undefined} />
      {label[status] || status}
    </span>
  );
}
