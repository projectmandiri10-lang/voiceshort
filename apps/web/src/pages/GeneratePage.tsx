import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Cpu,
  FolderClock,
  Gauge,
  Globe,
  History,
  Layers3,
  Link2,
  PenSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wallet,
} from "lucide-react";
import { ApiError, createJob, fetchGenerationCapacity, fetchJobs } from "../api";
import { getGenerateBlocker } from "../job-download-policy";
import { CONTENT_LABEL, GENDER_LABEL, TONE_OPTIONS } from "../job-form-options";
import type { AuthUser, ContentType, GenerationCapacity, JobVoiceGender } from "../types";
import { CONTENT_TYPES } from "../types";
import { readVideoDuration } from "../video-duration";
import {
  calculateBilledMinutes,
  calculateEstimatedChargeIdr,
  formatVideoDuration,
} from "../utils/billing";

const DEFAULT_CONTENT_TYPE: ContentType = "affiliate";
const DEFAULT_VOICE_GENDER: JobVoiceGender = "female";
const DEFAULT_TONE = "natural";
const SERVER_OVERLOAD_FALLBACK =
  "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi.";
const STATUS_CHECK_ERROR_MESSAGE =
  "Status job sebelumnya belum bisa diverifikasi. Muat ulang halaman atau buka Riwayat untuk memastikan job lama sudah selesai dan terunduh.";

interface GeneratePageProps {
  currentUser: AuthUser;
  onRefreshSession: () => Promise<void>;
  onViewJobs: (jobId?: string) => void;
}

interface GenerateFormState {
  video: File | null;
  videoDurationSec: number | null;
  billedMinutes: number | null;
  estimatedChargeIdr: number | null;
  durationPending: boolean;
  durationError: string;
  title: string;
  description: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText: string;
  referenceLink: string;
  fileInputKey: number;
}

function formatRupiah(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatWaitMinutes(value: number): string {
  if (value <= 0) {
    return "0m";
  }
  return `${value.toFixed(value < 10 ? 1 : 0)}m`;
}

function createInitialFormState(): GenerateFormState {
  return {
    video: null,
    videoDurationSec: null,
    billedMinutes: null,
    estimatedChargeIdr: null,
    durationPending: false,
    durationError: "",
    title: "",
    description: "",
    contentType: DEFAULT_CONTENT_TYPE,
    voiceGender: DEFAULT_VOICE_GENDER,
    tone: DEFAULT_TONE,
    ctaText: "",
    referenceLink: "",
    fileInputKey: 0,
  };
}

function isFormReady(form: GenerateFormState): boolean {
  return Boolean(
    form.video &&
      form.videoDurationSec &&
      form.billedMinutes &&
      form.estimatedChargeIdr &&
      !form.durationPending &&
      !form.durationError &&
      form.title.trim() &&
      form.description.trim() &&
      form.tone.trim()
  );
}

function buildOverloadedCapacity(
  message: string,
  current: GenerationCapacity | null
): GenerationCapacity {
  return {
    overloaded: true,
    runningCount: current?.runningCount ?? 0,
    queuedCount: current?.queuedCount ?? 0,
    maxRunningJobs: current?.maxRunningJobs ?? 3,
    maxQueuedJobs: current?.maxQueuedJobs ?? 20,
    maxRunningPerUser: current?.maxRunningPerUser ?? 1,
    message,
  };
}

export function GeneratePage({ currentUser, onRefreshSession, onViewJobs }: GeneratePageProps) {
  const [form, setForm] = useState<GenerateFormState>(() => createInitialFormState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [capacity, setCapacity] = useState<GenerationCapacity | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [blockerJobId, setBlockerJobId] = useState<string | undefined>(undefined);
  const [blockerMessage, setBlockerMessage] = useState("");

  const hasEnoughBalance =
    currentUser.isUnlimited || currentUser.walletBalanceIdr >= currentUser.generatePriceIdr;
  const isServerOverloaded = Boolean(capacity?.overloaded);
  const estimatedRemainingMinutes = currentUser.isUnlimited
    ? null
    : Math.max(
        0,
        Math.floor(
          (currentUser.walletBalanceIdr - (form.estimatedChargeIdr ?? 0)) /
            currentUser.generatePriceIdr
        )
      );
  const projectedBalanceIdr = currentUser.isUnlimited
    ? null
    : Math.max(0, currentUser.walletBalanceIdr - (form.estimatedChargeIdr ?? 0));
  const isBlocked = statusLoading || Boolean(statusError) || Boolean(blockerMessage);
  const formDisabled = loading || !hasEnoughBalance || isServerOverloaded || isBlocked;
  const maxRunningJobs = capacity?.maxRunningJobs ?? 3;
  const maxQueuedJobs = capacity?.maxQueuedJobs ?? 20;
  const utilizationPercent = Math.round(
    Math.min(
      100,
      ((capacity?.runningCount ?? 0) / Math.max(maxRunningJobs, 1)) * 72 +
        ((capacity?.queuedCount ?? 0) / Math.max(maxQueuedJobs, 1)) * 28
    )
  );
  const estimatedWaitMinutes = capacity
    ? Number((capacity.queuedCount * 4 + capacity.runningCount * 1.5).toFixed(1))
    : 0;
  const latencyMs = 12 + (capacity?.runningCount ?? 0) * 4 + (capacity?.queuedCount ?? 0) * 2;

  let workspaceStatusLabel = "Lengkapi data";
  let workspaceStatusTone = "status-queued";
  let workspaceStatusDescription = "Isi video, judul, dan brief agar job siap diproses.";

  if (loading) {
    workspaceStatusLabel = "Membuat job...";
    workspaceStatusTone = "status-running";
    workspaceStatusDescription =
      "Permintaan generate sedang dikirim ke backend dan saldo akan disinkronkan ulang setelah job masuk antrean.";
  } else if (statusLoading) {
    workspaceStatusLabel = "Memeriksa";
    workspaceStatusTone = "status-running";
    workspaceStatusDescription = "Sistem sedang mengecek apakah masih ada job sebelumnya.";
  } else if (statusError) {
    workspaceStatusLabel = "Belum bisa diproses";
    workspaceStatusTone = "status-failed";
    workspaceStatusDescription = statusError || STATUS_CHECK_ERROR_MESSAGE;
  } else if (blockerMessage) {
    workspaceStatusLabel = "Selesaikan job sebelumnya";
    workspaceStatusTone = "status-failed";
    workspaceStatusDescription = blockerMessage;
  } else if (isServerOverloaded) {
    workspaceStatusLabel = "Server sedang sibuk";
    workspaceStatusTone = "status-failed";
    workspaceStatusDescription = capacity?.message || SERVER_OVERLOAD_FALLBACK;
  } else if (!hasEnoughBalance) {
    workspaceStatusLabel = "Saldo kurang";
    workspaceStatusTone = "status-interrupted";
    workspaceStatusDescription = "Isi saldo dulu untuk memulai job baru.";
  } else if (isFormReady(form)) {
    workspaceStatusLabel = "Siap diproses";
    workspaceStatusTone = "status-success";
    workspaceStatusDescription = "Semua data utama sudah siap. Job bisa langsung dikirim.";
  }

  const telemetryStatusLabel = statusError
    ? "Perlu dicek"
    : blockerMessage
      ? "Tuntaskan job lama"
      : isServerOverloaded
        ? "Server sedang sibuk"
        : !hasEnoughBalance
          ? "Saldo belum cukup"
          : workspaceStatusLabel;
  const telemetryStatusDescription = statusError
    ? "Status job sebelumnya perlu dicek ulang sebelum Anda bisa membuat job baru."
    : blockerMessage
      ? "Caption dan video hasil job sebelumnya masih perlu diselesaikan dari halaman Riwayat."
      : isServerOverloaded
        ? "Server sedang padat. Tunggu sebentar lalu coba lagi."
        : !hasEnoughBalance
          ? "Tambahkan saldo terlebih dahulu agar job baru bisa diproses."
          : workspaceStatusDescription;

  useEffect(() => {
    let mounted = true;

    const loadWorkspaceState = async (surfaceFailure: boolean) => {
      try {
        const [jobs, nextCapacity] = await Promise.all([fetchJobs(), fetchGenerationCapacity()]);
        if (!mounted) {
          return;
        }

        const blocker = getGenerateBlocker(currentUser, jobs);
        setCapacity(nextCapacity);
        setBlockerJobId(blocker?.jobId);
        setBlockerMessage(blocker?.message || "");
        setStatusError("");
      } catch (workspaceError) {
        if (!mounted) {
          return;
        }

        if (surfaceFailure) {
          const message = (workspaceError as Error).message || STATUS_CHECK_ERROR_MESSAGE;
          setStatusError(message || STATUS_CHECK_ERROR_MESSAGE);
        }
      } finally {
        if (mounted) {
          setStatusLoading(false);
        }
      }
    };

    void loadWorkspaceState(true);
    const timer = window.setInterval(() => {
      void loadWorkspaceState(false);
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [currentUser]);

  const updateForm = (updater: (current: GenerateFormState) => GenerateFormState) => {
    setForm((current) => updater(current));
  };

  const onVideoSelected = (file: File | null) => {
    updateForm((current) => ({
      ...current,
      video: file,
      videoDurationSec: null,
      billedMinutes: null,
      estimatedChargeIdr: null,
      durationPending: Boolean(file),
      durationError: "",
    }));

    if (!file) {
      return;
    }

    void readVideoDuration(file)
      .then((durationSec) => {
        updateForm((current) => {
          if (current.video !== file) {
            return current;
          }
          return {
            ...current,
            videoDurationSec: durationSec,
            billedMinutes: calculateBilledMinutes(durationSec),
            estimatedChargeIdr: calculateEstimatedChargeIdr(
              durationSec,
              currentUser.generatePriceIdr
            ),
            durationPending: false,
            durationError: "",
          };
        });
      })
      .catch((durationErrorValue) => {
        updateForm((current) => {
          if (current.video !== file) {
            return current;
          }
          return {
            ...current,
            durationPending: false,
            durationError:
              (durationErrorValue as Error).message || "Durasi video tidak bisa dibaca.",
          };
        });
      });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (statusLoading) {
      setError("Status workspace masih diperiksa. Tunggu sebentar lalu coba lagi.");
      return;
    }
    if (statusError) {
      setError(statusError || STATUS_CHECK_ERROR_MESSAGE);
      return;
    }
    if (blockerMessage) {
      setError(blockerMessage);
      return;
    }
    if (isServerOverloaded) {
      setError(capacity?.message || SERVER_OVERLOAD_FALLBACK);
      return;
    }
    if (!hasEnoughBalance) {
      setError("Saldo belum cukup. Isi saldo minimal Rp2.000 untuk memproses 1 menit video.");
      return;
    }
    if (!form.video) {
      setError("File video wajib diisi.");
      return;
    }
    if (form.durationPending) {
      setError("Durasi video masih dibaca. Tunggu sebentar lalu coba lagi.");
      return;
    }
    if (form.durationError) {
      setError(form.durationError);
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      setError("Lengkapi judul dan brief/deskripsi terlebih dahulu.");
      return;
    }
    if (!isFormReady(form)) {
      setError(
        "Form belum lengkap. Pastikan video, judul, brief, kategori, gender, dan tone sudah siap."
      );
      return;
    }

    setLoading(true);
    try {
      const result = await createJob({
        video: form.video,
        title: form.title.trim(),
        description: form.description.trim(),
        contentType: form.contentType,
        voiceGender: form.voiceGender,
        tone: form.tone.trim(),
        ctaText: form.ctaText.trim(),
        referenceLink: form.referenceLink.trim(),
      });

      try {
        await onRefreshSession();
      } catch (refreshError) {
        setError(
          `Job berhasil dibuat, tetapi pembaruan saldo gagal: ${(refreshError as Error).message}`
        );
      }

      setForm((current) => ({
        ...createInitialFormState(),
        fileInputKey: current.fileInputKey + 1,
      }));
      onViewJobs(result.jobId);
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 503) {
        setCapacity((current) =>
          buildOverloadedCapacity(submitError.message || SERVER_OVERLOAD_FALLBACK, current)
        );
      }
      setError((submitError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="generate-concise-shell">
      <div className="generate-editor-column">
        <div className="generate-hero">
          <div className="generate-hero-tags">
            <span className="eyebrow">Buat Voice Over</span>
            <span className="generate-hero-chip">Single Job Workspace</span>
          </div>
          <h2>Buat voice over untuk video Anda</h2>
          <p>Unggah video, isi arahan singkat, lalu kirim job dalam beberapa langkah saja.</p>
        </div>

        <div className="generate-editor-stack">
          {statusError ? (
            <section className="workspace-inline-card workspace-inline-card-danger">
              <div className="workspace-inline-card-head">
                <strong>Status belum terverifikasi</strong>
                <span className="small">Coba cek riwayat proses</span>
              </div>
              <p className="err-text">{statusError || STATUS_CHECK_ERROR_MESSAGE}</p>
              <div className="form-actions">
                <button type="button" onClick={() => onViewJobs()}>
                  <FolderClock size={16} />
                  <span>Riwayat Proses</span>
                </button>
              </div>
            </section>
          ) : null}

          {!statusError && blockerMessage ? (
            <section className="workspace-inline-card workspace-inline-card-danger">
              <div className="workspace-inline-card-head">
                <strong>Generate job baru masih terkunci</strong>
                <span className="small">Selesaikan job sebelumnya</span>
              </div>
              <p className="err-text">{blockerMessage}</p>
              <div className="form-actions">
                <button type="button" onClick={() => onViewJobs(blockerJobId)}>
                  <FolderClock size={16} />
                  <span>Riwayat Proses</span>
                </button>
              </div>
            </section>
          ) : null}

          {!statusError && !blockerMessage && isServerOverloaded ? (
            <section className="workspace-inline-card workspace-inline-card-danger">
              <div className="workspace-inline-card-head">
                <strong>Server overload</strong>
                <span className="small">
                  Aktif {capacity?.runningCount ?? 0}/{capacity?.maxRunningJobs ?? 3} | Antrean{" "}
                  {capacity?.queuedCount ?? 0}/{capacity?.maxQueuedJobs ?? 20}
                </span>
              </div>
              <p className="err-text">{capacity?.message || SERVER_OVERLOAD_FALLBACK}</p>
            </section>
          ) : null}

          {statusLoading && !statusError ? (
            <section className="workspace-inline-card">
              <div className="workspace-inline-card-head">
                <strong>Memeriksa workspace</strong>
                <span className="small">Cek status job</span>
              </div>
              <p className="section-note">
                Sistem sedang mengecek apakah masih ada job lama yang aktif atau belum selesai.
              </p>
            </section>
          ) : null}

          <form onSubmit={onSubmit} className="generate-workspace-form">
            <section className="generate-upload-card" role="region" aria-label="slot video 1">
              <div className="generate-section-head">
                <div>
                  <span className="generate-section-label">Upload Video</span>
                  <h3>Video Utama</h3>
                  <p className="small">Satu video untuk satu job voice over.</p>
                </div>
                <span
                  className={
                    isFormReady(form) ? "batch-slot-status batch-slot-status-ready" : "batch-slot-status batch-slot-status-empty"
                  }
                >
                  {isFormReady(form) ? "Siap" : "Belum Lengkap"}
                </span>
              </div>

              <label className="generate-upload-label">
                <span className="generate-field-label">
                  Video <span className="required-mark">*</span>
                </span>
                <input
                  key={form.fileInputKey}
                  className="sr-only"
                  type="file"
                  accept="video/*"
                  onChange={(event) => onVideoSelected(event.target.files?.[0] || null)}
                  disabled={formDisabled}
                />
                <div className="generate-upload-dropzone" aria-hidden="true">
                  <div className="generate-upload-main">
                    <div className="generate-upload-icon">
                      <UploadCloud size={30} strokeWidth={2} />
                    </div>
                    <div className="generate-upload-copy">
                      <h4>{form.video ? form.video.name : "Pilih video (.mp4 / .mov)"}</h4>
                      <p>Maksimal 500MB. Durasi video akan dihitung otomatis untuk estimasi biaya.</p>
                    </div>
                  </div>
                  <div className="generate-upload-side">
                    <div className="generate-ready-indicator">
                      <span className="generate-ready-dot" aria-hidden="true" />
                      <span>{formDisabled ? "Belum siap" : "Siap"}</span>
                    </div>
                    <span className="generate-upload-trigger">Pilih File</span>
                  </div>
                </div>
              </label>

              <div className="generate-upload-meta">
                <div className="generate-meta-item">
                  <Clock3 size={15} strokeWidth={2} />
                  <div>
                    <span className="generate-meta-label">Durasi</span>
                    <strong className="generate-meta-value">
                      {form.durationPending
                        ? "Membaca..."
                        : form.videoDurationSec
                          ? formatVideoDuration(form.videoDurationSec)
                          : "00:00"}
                    </strong>
                  </div>
                </div>
                <div className="generate-meta-divider" aria-hidden="true" />
                <div className="generate-meta-item">
                  <CircleDollarSign size={15} strokeWidth={2} />
                  <div>
                    <span className="generate-meta-label">Biaya</span>
                    <strong className="generate-meta-value">
                      {currentUser.isUnlimited
                        ? "Unlimited"
                        : formatRupiah(form.estimatedChargeIdr ?? 0)}
                    </strong>
                  </div>
                </div>
                <div className="generate-meta-divider" aria-hidden="true" />
                <div className="generate-meta-item">
                  <Gauge size={15} strokeWidth={2} />
                  <div>
                    <span className="generate-meta-label">Menit</span>
                    <strong className="generate-meta-value">{form.billedMinutes ?? 0}</strong>
                  </div>
                </div>
              </div>

              {form.durationError ? <p className="err-inline">{form.durationError}</p> : null}
            </section>

            <section className="generate-fields-card">
              <div className="generate-section-head">
                <div>
                  <span className="generate-section-label">Isi Detail</span>
                  <h3>Detail Voice Over</h3>
                  <p className="small">
                    Isi informasi dasar agar hasil voice over sesuai dengan kebutuhan Anda.
                  </p>
                </div>
              </div>

              <div className="generate-field-grid">
                <label className="generate-field">
                  <span className="generate-field-label">
                    Judul <span className="required-mark">*</span>
                  </span>
                  <div className="generate-input-wrap">
                    <input
                      value={form.title}
                      onChange={(event) =>
                        updateForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      disabled={formDisabled}
                      placeholder="Judul singkat untuk hasil voice over"
                    />
                    <span className="generate-input-icon" aria-hidden="true">
                      <PenSquare size={16} strokeWidth={2} />
                    </span>
                  </div>
                </label>

                <label className="generate-field">
                  <span className="generate-field-label">
                    Brief / Deskripsi <span className="required-mark">*</span>
                  </span>
                  <textarea
                    rows={5}
                    value={form.description}
                    onChange={(event) =>
                      updateForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    disabled={formDisabled}
                    placeholder="Tulis arahan utama, angle promosi, atau narasi yang diinginkan"
                  />
                </label>

                <div className="generate-field-row">
                  <label className="generate-field">
                    <span className="generate-field-label">
                      Kategori Konten <span className="required-mark">*</span>
                    </span>
                    <div className="generate-input-wrap">
                      <select
                        value={form.contentType}
                        onChange={(event) =>
                          updateForm((current) => ({
                            ...current,
                            contentType: event.target.value as ContentType,
                          }))
                        }
                        disabled={formDisabled}
                      >
                        {CONTENT_TYPES.map((item) => (
                          <option key={item} value={item}>
                            {CONTENT_LABEL[item]}
                          </option>
                        ))}
                      </select>
                      <span className="generate-input-icon" aria-hidden="true">
                        <Layers3 size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>

                  <label className="generate-field">
                    <span className="generate-field-label">
                      Gender Suara <span className="required-mark">*</span>
                    </span>
                    <div className="generate-input-wrap">
                      <select
                        value={form.voiceGender}
                        onChange={(event) =>
                          updateForm((current) => ({
                            ...current,
                            voiceGender: event.target.value as JobVoiceGender,
                          }))
                        }
                        disabled={formDisabled}
                      >
                        {(Object.keys(GENDER_LABEL) as JobVoiceGender[]).map((gender) => (
                          <option key={gender} value={gender}>
                            {GENDER_LABEL[gender]}
                          </option>
                        ))}
                      </select>
                      <span className="generate-input-icon" aria-hidden="true">
                        <Radio size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>
                </div>

                <div className="generate-field-row">
                  <label className="generate-field">
                    <span className="generate-field-label">
                      Tone <span className="required-mark">*</span>
                    </span>
                    <div className="generate-input-wrap">
                      <select
                        value={form.tone}
                        onChange={(event) =>
                          updateForm((current) => ({
                            ...current,
                            tone: event.target.value,
                          }))
                        }
                        disabled={formDisabled}
                      >
                        {TONE_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <span className="generate-input-icon" aria-hidden="true">
                        <Sparkles size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>

                  <label className="generate-field">
                    <span className="generate-field-label">CTA Opsional</span>
                    <div className="generate-input-wrap">
                      <input
                        value={form.ctaText}
                        placeholder="Contoh: cek detailnya sekarang"
                        onChange={(event) =>
                          updateForm((current) => ({
                            ...current,
                            ctaText: event.target.value,
                          }))
                        }
                        disabled={formDisabled}
                      />
                      <span className="generate-input-icon" aria-hidden="true">
                        <Link2 size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>
                </div>

                <label className="generate-field">
                  <span className="generate-field-label">Link Referensi Opsional</span>
                  <div className="generate-input-wrap">
                    <input
                      value={form.referenceLink}
                      placeholder="https://..."
                      onChange={(event) =>
                        updateForm((current) => ({
                          ...current,
                          referenceLink: event.target.value,
                        }))
                      }
                      disabled={formDisabled}
                    />
                    <span className="generate-input-icon" aria-hidden="true">
                      <Globe size={16} strokeWidth={2} />
                    </span>
                  </div>
                </label>
              </div>
            </section>

            {error ? <p className="err-text">{error}</p> : null}

            <div className="generate-floating-dock">
              <button
                type="button"
                className="generate-history-button"
                onClick={() => onViewJobs(blockerJobId)}
              >
                <History size={17} strokeWidth={2} />
                <span>Riwayat Proses</span>
              </button>

              <div className="generate-dock-divider" aria-hidden="true" />

              <div className="generate-dock-summary">
                <span className="generate-dock-label">Estimasi Biaya</span>
                <strong>
                  {currentUser.isUnlimited
                    ? "Unlimited"
                    : formatRupiah(form.estimatedChargeIdr ?? 0)}
                </strong>
                <p className="small">
                  {currentUser.isUnlimited
                    ? "Tanpa estimasi biaya"
                    : `${form.billedMinutes ?? 0} menit billing siap submit`}
                </p>
              </div>

              <button type="submit" className="generate-submit-button" disabled={formDisabled}>
                <Sparkles size={17} strokeWidth={2} />
                <span>{loading ? "Membuat job..." : "Generate Job Baru"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <aside className="generate-side-panel">
        <div className="generate-side-head">
          <h3>Ringkasan</h3>
          <span className="generate-live-pill">
            <span className="generate-live-dot" aria-hidden="true" />
            Aktif
          </span>
        </div>

        <section className="generate-side-card generate-compute-card">
          <div className="generate-compute-head">
            <div>
              <span className="generate-section-label">Status Server</span>
              <h4>
                {utilizationPercent}
                <span>%</span>
              </h4>
            </div>
            <span className={workspaceStatusTone === "status-success" ? "status status-success" : workspaceStatusTone === "status-failed" ? "status status-failed" : workspaceStatusTone === "status-interrupted" ? "status status-interrupted" : workspaceStatusTone === "status-running" ? "status status-running" : "status status-queued"}>
              {workspaceStatusTone === "status-success"
                ? "Lancar"
                : workspaceStatusTone === "status-failed"
                  ? "Tertahan"
                  : workspaceStatusTone === "status-interrupted"
                    ? "Isi Saldo"
                    : workspaceStatusTone === "status-running"
                      ? "Memeriksa"
                      : "Menunggu"}
            </span>
          </div>

          <div className="generate-progress-stack">
            <div className="generate-progress-head">
              <span>Kondisi antrean</span>
              <strong>
                {capacity?.runningCount ?? 0} / {maxRunningJobs} proses aktif
              </strong>
            </div>
            <div className="generate-progress-track">
              <div className="generate-progress-value" style={{ width: `${utilizationPercent}%` }} />
            </div>
          </div>

          <div className="generate-compute-metrics">
            <div className="generate-compute-metric">
              <Clock3 size={15} strokeWidth={2} />
              <span>Perkiraan tunggu</span>
              <strong>{formatWaitMinutes(estimatedWaitMinutes)}</strong>
            </div>
            <div className="generate-compute-metric">
              <Cpu size={15} strokeWidth={2} />
              <span>Respon</span>
              <strong>{latencyMs}ms</strong>
            </div>
          </div>
        </section>

        <section className="generate-side-card">
          <span className="generate-section-label">Perkiraan Biaya</span>
          <div className="generate-stat-list">
            <div className="generate-stat-row">
              <span>Biaya job ini</span>
              <strong>{currentUser.isUnlimited ? "Unlimited" : formatRupiah(form.estimatedChargeIdr ?? 0)}</strong>
            </div>
            <div className="generate-stat-row">
              <span>Sisa saldo</span>
              <strong>
                {currentUser.isUnlimited
                  ? "Saldo Unlimited"
                  : formatRupiah(projectedBalanceIdr ?? currentUser.walletBalanceIdr)}
              </strong>
            </div>
            <div className="generate-stat-row">
              <span>Status Saldo</span>
              <strong>{hasEnoughBalance ? "Siap diproses" : "Perlu isi saldo"}</strong>
            </div>
            {!currentUser.isUnlimited ? (
              <p className="small">
                Biaya {formatRupiah(currentUser.generatePriceIdr)} per menit. Sisa estimasi setelah
                job: {estimatedRemainingMinutes ?? 0} menit.
              </p>
            ) : (
              <p className="small">Akun ini bisa dipakai tanpa batas saldo.</p>
            )}
          </div>
        </section>

        <section className="generate-side-card">
          <span className="generate-section-label">Status Proses</span>
          <div className="generate-pipeline-item">
            <div className="generate-pipeline-icon">
              <Gauge size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="generate-pipeline-title">Antrean</p>
              <strong>
                Queue {capacity?.queuedCount ?? 0}/{maxQueuedJobs}
              </strong>
            </div>
          </div>
          <div className="generate-pipeline-item">
            <div className="generate-pipeline-icon generate-pipeline-icon-magenta">
              <Wallet size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="generate-pipeline-title">Tagihan</p>
              <strong>{form.billedMinutes ?? 0} menit</strong>
            </div>
          </div>
          <div className="generate-pipeline-item">
            <div className="generate-pipeline-icon">
              <Layers3 size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="generate-pipeline-title">Total proses</p>
              <strong>{(capacity?.runningCount ?? 0) + (capacity?.queuedCount ?? 0)} job aktif</strong>
            </div>
          </div>
        </section>

        <section className="generate-side-card generate-environment-card">
          <div className="generate-environment-icon">
            {workspaceStatusTone === "status-success" ? (
              <CheckCircle2 size={22} strokeWidth={2} />
            ) : workspaceStatusTone === "status-running" ? (
              <Clock3 size={22} strokeWidth={2} />
            ) : workspaceStatusTone === "status-interrupted" ? (
              <Wallet size={22} strokeWidth={2} />
            ) : workspaceStatusTone === "status-failed" ? (
              <ShieldCheck size={22} strokeWidth={2} />
            ) : (
              <Sparkles size={22} strokeWidth={2} />
            )}
          </div>
          <div>
            <h4>{telemetryStatusLabel}</h4>
            <p>{telemetryStatusDescription}</p>
          </div>
        </section>
      </aside>
    </section>
  );
}
