import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { GenerationSessionStatus } from "../types";

const palette: Record<GenerationSessionStatus, string> = {
  creating: "status-badge status-queued",
  completed: "status-badge status-success",
  failed: "status-badge status-failed",
};

const label: Record<GenerationSessionStatus, string> = {
  creating: "Membuat",
  completed: "Selesai",
  failed: "Gagal",
};

const icon = {
  creating: Clock3,
  completed: CheckCircle2,
  failed: XCircle,
} satisfies Record<GenerationSessionStatus, typeof Clock3>;

export function StatusBadge({ status }: { status: GenerationSessionStatus }) {
  const Icon = icon[status] || Clock3;

  return (
    <span className={palette[status] || "status-badge status-queued"}>
      <Icon size={14} strokeWidth={2.2} />
      {label[status] || status}
    </span>
  );
}
