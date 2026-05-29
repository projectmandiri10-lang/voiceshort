import { CheckCircle2, Clock3, LoaderCircle, XCircle } from "lucide-react";
import type { GenerationSessionStatus } from "../types";

const palette: Record<GenerationSessionStatus, string> = {
  creating: "status-badge status-queued",
  ready_for_audio: "status-badge status-running",
  ready_for_render: "status-badge status-running",
  completed: "status-badge status-success",
  failed: "status-badge status-failed",
};

const label: Record<GenerationSessionStatus, string> = {
  creating: "Membuat",
  ready_for_audio: "Siap Audio",
  ready_for_render: "Siap Render",
  completed: "Selesai",
  failed: "Gagal",
};

const icon = {
  creating: Clock3,
  ready_for_audio: LoaderCircle,
  ready_for_render: LoaderCircle,
  completed: CheckCircle2,
  failed: XCircle,
} satisfies Record<GenerationSessionStatus, typeof Clock3>;

export function StatusBadge({ status }: { status: GenerationSessionStatus }) {
  const Icon = icon[status] || Clock3;

  return (
    <span className={palette[status] || "status-badge status-queued"}>
      <Icon
        size={14}
        strokeWidth={2.2}
        className={status === "ready_for_audio" || status === "ready_for_render" ? "animate-spin" : undefined}
      />
      {label[status] || status}
    </span>
  );
}
