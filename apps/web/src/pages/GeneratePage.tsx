import { useEffect, useState, type FormEvent } from "react";
import { CircleDollarSign, FolderClock, Gauge, Sparkles, UploadCloud } from "lucide-react";
import { ApiError, createJob, fetchGenerationCapacity, fetchJobs } from "../api";
import { getGenerateBlocker } from "../job-download-policy";
import { CONTENT_LABEL, GENDER_LABEL, TONE_OPTIONS } from "../job-form-options";
import type { AuthUser, ContentType, GenerationCapacity, JobVoiceGender } from "../types";
import { CONTENT_TYPES } from "../types";
import { readVideoDuration } from "../video-duration";
import {
  calculateBilledMinutes,
  calculateEstimatedChargeIdr,
  formatVideoDuration
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
    fileInputKey: 0
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
    message
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
  const isBlocked = statusLoading || Boolean(statusError) || Boolean(blockerMessage);
  const formDisabled = loading || !hasEnoughBalance || isServerOverloaded || isBlocked;

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
      durationError: ""
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
            estimatedChargeIdr: calculateEstimatedChargeIdr(durationSec, currentUser.generatePriceIdr),
            durationPending: false,
            durationError: ""
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
              (durationErrorValue as Error).message || "Durasi video tidak bisa dibaca."
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
      setError("Form belum lengkap. Pastikan video, judul, brief, kategori, gender, dan tone sudah siap.");
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
        referenceLink: form.referenceLink.trim()
      });

      try {
        await onRefreshSession();
      } catch (refreshError) {
        setError(`Job berhasil dibuat, tetapi pembaruan saldo gagal: ${(refreshError as Error).message}`);
      }

      setForm((current) => ({
        ...createInitialFormState(),
        fileInputKey: current.fileInputKey + 1
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
    <section className="card app-page-card generate-shell">
      <div className="section-heading compact">
        <span className="eyebrow">Single Job Workspace</span>
        <h2>Buat satu job baru hanya setelah hasil job sebelumnya selesai diunduh.</h2>
        <p className="section-note">
          Flow ini menjaga penggunaan storage lebih hemat di server. Setiap siklus: generate, tunggu
          selesai, unduh caption dan final video, lalu baru lanjut job berikutnya.
        </p>
      </div>

      <div className="telemetry-grid">
        <section className="monitor-banner">
          <span className="eyebrow">Core Telemetry</span>
          <h3>Single active generation channel</h3>
          <p className="section-note">
            Pantau status workspace, antrean server, dan estimasi biaya sebelum mengeksekusi job
            berikutnya.
          </p>
          <div className="monitor-grid">
            <div className="monitor-cell">
              <Sparkles size={18} />
              <strong>1</strong>
              <span className="small">Slot aktif per siklus</span>
            </div>
            <div className="monitor-cell">
              <Gauge size={18} />
              <strong>
                {capacity?.runningCount ?? 0} / {capacity?.maxRunningJobs ?? 3}
              </strong>
              <span className="small">Job berjalan</span>
            </div>
            <div className="monitor-cell">
              <CircleDollarSign size={18} />
              <strong>{form.billedMinutes ?? 0}</strong>
              <span className="small">Menit billing job ini</span>
            </div>
          </div>
        </section>

        <div className="grid-form">
          <div className="quota-banner">
            <div>
              <strong>
                {currentUser.isUnlimited
                  ? "Saldo Unlimited"
                  : `Saldo deposit ${formatRupiah(currentUser.walletBalanceIdr)}`}
              </strong>
              {currentUser.isUnlimited ? (
                <p className="small">Akun whitelist dapat memproses video tanpa batas saldo.</p>
              ) : (
                <>
                  <p className="small">
                    Biaya {formatRupiah(currentUser.generatePriceIdr)} per menit. Saldo saat ini
                    cukup untuk {currentUser.generateCreditsRemaining} menit penuh.
                  </p>
                  <p className="small">
                    Estimasi job ini: {formatRupiah(form.estimatedChargeIdr ?? 0)} untuk{" "}
                    {form.billedMinutes ?? 0} menit billing. Sisa estimasi setelah job:{" "}
                    {estimatedRemainingMinutes ?? 0} menit.
                  </p>
                </>
              )}
            </div>
            {!hasEnoughBalance ? (
              <span className="status status-failed">Perlu isi saldo</span>
            ) : blockerMessage ? (
              <span className="status status-failed">Terkunci</span>
            ) : (
              <span className="status status-success">Siap diproses</span>
            )}
          </div>

          {isServerOverloaded ? (
            <div className="notice-box notice-box-overload">
              <div className="row-head">
                <strong>Server overload</strong>
                <span className="small">
                  Aktif {capacity?.runningCount ?? 0}/{capacity?.maxRunningJobs ?? 3} | Antrean{" "}
                  {capacity?.queuedCount ?? 0}/{capacity?.maxQueuedJobs ?? 20}
                </span>
              </div>
              <p className="err-text">{capacity?.message || SERVER_OVERLOAD_FALLBACK}</p>
            </div>
          ) : (
            <div className="notice-box">
              <div className="row-head">
                <strong>Status antrean</strong>
                <span className="small">
                  Queue {capacity?.queuedCount ?? 0}/{capacity?.maxQueuedJobs ?? 20}
                </span>
              </div>
              <p className="section-note">
                Workspace ini hanya mengizinkan satu job aktif per siklus sampai file hasil job
                sebelumnya diunduh lengkap.
              </p>
            </div>
          )}
        </div>
      </div>

      {statusLoading ? (
        <div className="notice-box">
          <div className="row-head">
            <strong>Memeriksa workspace</strong>
            <span className="small">Sinkronisasi status job</span>
          </div>
          <p className="section-note">Sistem sedang memeriksa apakah masih ada job lama yang aktif atau belum diunduh.</p>
        </div>
      ) : null}

      {statusError ? (
        <div className="notice-box notice-box-overload">
          <div className="row-head">
            <strong>Status belum terverifikasi</strong>
            <span className="small">Generate dikunci sementara</span>
          </div>
          <p className="err-text">{statusError || STATUS_CHECK_ERROR_MESSAGE}</p>
          <div className="form-actions">
            <button type="button" onClick={() => onViewJobs()}>
              <FolderClock size={16} />
              <span>Buka Riwayat Proses</span>
            </button>
          </div>
        </div>
      ) : null}

      {!statusError && blockerMessage ? (
        <div className="notice-box notice-box-overload">
          <div className="row-head">
            <strong>Generate job baru masih terkunci</strong>
            <span className="small">Selesaikan siklus job sebelumnya</span>
          </div>
          <p className="err-text">{blockerMessage}</p>
          <div className="form-actions">
            <button type="button" onClick={() => onViewJobs(blockerJobId)}>
              <FolderClock size={16} />
              <span>Buka Riwayat Proses</span>
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid-form">
        <section className="batch-slot-card" role="region" aria-label="slot video 1">
          <div className="slot-card-header">
            <div>
              <strong>Job Baru</strong>
              <p className="small">Satu form ini akan membuat satu job voice over baru.</p>
            </div>
            <span className="batch-slot-status batch-slot-status-ready">
              {isFormReady(form) ? "Siap" : "Belum Lengkap"}
            </span>
          </div>

          <div className="grid-form">
            <label>
              Video <span className="required-mark">*</span>
              <input
                key={form.fileInputKey}
                type="file"
                accept="video/*"
                onChange={(event) => onVideoSelected(event.target.files?.[0] || null)}
                disabled={formDisabled}
              />
              <div className="slot-dropzone" aria-hidden="true">
                <UploadCloud size={24} />
                <strong>{form.video ? form.video.name : "Unggah file MP4/MOV"}</strong>
                <span className="small">
                  Maksimum 1 video per siklus. Durasi dipakai untuk estimasi biaya sebelum submit.
                </span>
              </div>
            </label>

            <div className="slot-estimate-card">
              {form.durationPending ? (
                <p className="small">Membaca durasi video...</p>
              ) : form.durationError ? (
                <p className="err-inline">{form.durationError}</p>
              ) : form.videoDurationSec && form.billedMinutes && form.estimatedChargeIdr ? (
                <>
                  <strong>
                    {formatVideoDuration(form.videoDurationSec)} | {form.billedMinutes} menit billing
                  </strong>
                  <span className="small">
                    Estimasi biaya {formatRupiah(form.estimatedChargeIdr)} untuk job ini.
                  </span>
                </>
              ) : (
                <span className="small">
                  Biaya akan dihitung otomatis dari durasi video upload.
                </span>
              )}
            </div>

            <label>
              Judul <span className="required-mark">*</span>
              <input
                value={form.title}
                onChange={(event) =>
                  updateForm((current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                disabled={formDisabled}
                placeholder="Judul singkat untuk hasil voice over"
              />
            </label>

            <label>
              Brief / Deskripsi <span className="required-mark">*</span>
              <textarea
                rows={5}
                value={form.description}
                onChange={(event) =>
                  updateForm((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
                disabled={formDisabled}
                placeholder="Tulis arahan utama, angle promosi, atau narasi yang diinginkan"
              />
            </label>

            <div className="form-grid-2">
              <label>
                Kategori Konten <span className="required-mark">*</span>
                <select
                  value={form.contentType}
                  onChange={(event) =>
                    updateForm((current) => ({
                      ...current,
                      contentType: event.target.value as ContentType
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
              </label>
              <label>
                Gender Suara <span className="required-mark">*</span>
                <select
                  value={form.voiceGender}
                  onChange={(event) =>
                    updateForm((current) => ({
                      ...current,
                      voiceGender: event.target.value as JobVoiceGender
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
              </label>
            </div>

            <div className="form-grid-2">
              <label>
                Tone <span className="required-mark">*</span>
                <select
                  value={form.tone}
                  onChange={(event) =>
                    updateForm((current) => ({
                      ...current,
                      tone: event.target.value
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
              </label>
              <label>
                CTA Opsional
                <input
                  value={form.ctaText}
                  placeholder="Contoh: cek detailnya sekarang"
                  onChange={(event) =>
                    updateForm((current) => ({
                      ...current,
                      ctaText: event.target.value
                    }))
                  }
                  disabled={formDisabled}
                />
              </label>
            </div>

            <label>
              Link Referensi Opsional
              <div className="slot-inline-note">
                <input
                  value={form.referenceLink}
                  placeholder="https://..."
                  onChange={(event) =>
                    updateForm((current) => ({
                      ...current,
                      referenceLink: event.target.value
                    }))
                  }
                  disabled={formDisabled}
                />
              </div>
            </label>
          </div>
        </section>

        <div className="sticky-action-bar">
          <div className="sticky-action-summary">
            <div className="sticky-action-count">
              <span className="eyebrow">Workspace Mode</span>
              <strong>Single Job</strong>
            </div>
            <div className="sticky-action-count">
              <span className="eyebrow">System Calculation</span>
              <strong>{currentUser.isUnlimited ? "Unlimited" : formatRupiah(form.estimatedChargeIdr ?? 0)}</strong>
              <span className="small">
                {currentUser.isUnlimited
                  ? "Tanpa estimasi biaya"
                  : `${form.billedMinutes ?? 0} menit billing siap submit`}
              </span>
            </div>
            <div className="sticky-action-count">
              <span className="eyebrow">Saldo Setelah Job</span>
              <strong>
                {currentUser.isUnlimited ? "Unlimited" : `${estimatedRemainingMinutes ?? 0} menit`}
              </strong>
            </div>
          </div>

          <div className="sticky-action-buttons">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onViewJobs(blockerJobId)}
            >
              <FolderClock size={16} />
              <span>Lihat Riwayat</span>
            </button>
            <button type="submit" className="primary-button" disabled={formDisabled}>
              <CircleDollarSign size={16} />
              <span>{loading ? "Membuat job..." : "Generate Job Baru"}</span>
            </button>
          </div>
        </div>
      </form>

      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
