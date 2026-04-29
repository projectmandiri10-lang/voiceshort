import type { JobProgress, JobProgressPhase, JobStatus } from "../types.js";

function nowIso(): string {
  return new Date().toISOString();
}

const PHASE_PRESET: Record<JobProgressPhase, { percent: number; label: string }> = {
  queued: {
    percent: 5,
    label: "Menunggu antrean"
  },
  analyzing: {
    percent: 28,
    label: "Menganalisis video"
  },
  scripting: {
    percent: 55,
    label: "Menyusun script voice over"
  },
  captioning: {
    percent: 70,
    label: "Membuat caption"
  },
  synthesizing: {
    percent: 82,
    label: "Membuat voice over"
  },
  rendering: {
    percent: 95,
    label: "Merender video final"
  },
  success: {
    percent: 100,
    label: "Selesai diproses"
  },
  failed: {
    percent: 100,
    label: "Gagal diproses"
  },
  interrupted: {
    percent: 100,
    label: "Proses terhenti"
  }
};

export function buildJobProgress(
  phase: JobProgressPhase,
  overrides: Partial<Pick<JobProgress, "percent" | "label" | "updatedAt">> = {}
): JobProgress {
  const preset = PHASE_PRESET[phase];
  return {
    phase,
    percent: Math.max(0, Math.min(100, Math.round(overrides.percent ?? preset.percent))),
    label: overrides.label ?? preset.label,
    updatedAt: overrides.updatedAt ?? nowIso()
  };
}

export function buildProgressFromStatus(status: JobStatus): JobProgress {
  switch (status) {
    case "queued":
      return buildJobProgress("queued");
    case "running":
      return buildJobProgress("analyzing", {
        percent: 15,
        label: "Memproses job"
      });
    case "success":
      return buildJobProgress("success");
    case "failed":
      return buildJobProgress("failed");
    case "interrupted":
      return buildJobProgress("interrupted");
    default:
      return buildJobProgress("queued");
  }
}
