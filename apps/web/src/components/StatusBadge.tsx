import { CheckCircle2, Clock3, LoaderCircle, XCircle } from "lucide-react";
import type { GenerationSessionStatus } from "../types";

const palette: Record<GenerationSessionStatus, string> = {
  creating: "status-badge status-queued",
  ready_for_voice_upload: "status-badge status-running",
  completed: "status-badge status-success",
  failed: "status-badge status-failed",
};

const label: Record<GenerationSessionStatus, string> = {
  creating: "Membuat",
  ready_for_voice_upload: "Menunggu Voice",
  completed: "Selesai",
  failed: "Gagal",
};

const icon = {
  creating: Clock3,
  ready_for_voice_upload: LoaderCircle,
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
        className={status === "ready_for_voice_upload" ? "animate-spin" : undefined}
      />
      {label[status] || status}
    </span>
  );
}
