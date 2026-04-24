import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  deleteJob,
  fetchJobDetail,
  fetchJobs,
  openJobOutputLocation,
  retryJob,
  updateJob
} from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { CONTENT_LABEL, GENDER_LABEL, TONE_OPTIONS } from "../job-form-options";
import type { ContentType, JobRecord, JobStatus, JobVoiceGender } from "../types";

type PanelMode = "view" | "edit";

interface EditFormState {
  title: string;
  description: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText: string;
  referenceLink: string;
}

const EMPTY_EDIT_FORM: EditFormState = {
  title: "",
  description: "",
  contentType: "affiliate",
  voiceGender: "female",
  tone: "natural",
  ctaText: "",
  referenceLink: ""
};

const EDITABLE_STATUSES: JobStatus[] = ["queued", "failed", "interrupted"];
const RETRYABLE_STATUSES: JobStatus[] = ["failed", "interrupted"];

function isJobEditable(status: JobStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

function isJobRetryable(status: JobStatus): boolean {
  return RETRYABLE_STATUSES.includes(status);
}

function toAbsoluteOutputUrl(outputPath: string): string {
  if (typeof window === "undefined") {
    return outputPath;
  }
  return new URL(outputPath, window.location.origin).toString();
}

function getCaptionOutputPath(job: JobRecord): string | undefined {
  return job.output.captionPath || job.output.scriptPath;
}

function toEditForm(job: JobRecord): EditFormState {
  return {
    title: job.title,
    description: job.description,
    contentType: job.contentType,
    voiceGender: job.voiceGender,
    tone: job.tone,
    ctaText: job.ctaText ?? "",
    referenceLink: job.referenceLink ?? ""
  };
}

function getSaveSuccessMessage(status: JobStatus): string {
  if (status === "queued") {
    return "Perubahan tersimpan. Perubahan akan dipakai selama job belum mulai diproses.";
  }
  return "Perubahan tersimpan. Klik Retry Job untuk memproses ulang.";
}

function getEditAvailabilityNote(status: JobStatus): string | undefined {
  if (status === "running" || status === "success") {
    return "Metadata job tidak bisa diubah setelah job berjalan atau selesai.";
  }
  return undefined;
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const selected = jobs.find((job) => job.jobId === selectedId) ?? jobs[0];
  const canEditSelected = selected ? isJobEditable(selected.status) : false;
  const canRetrySelected = selected ? isJobRetryable(selected.status) : false;
  const editAvailabilityNote = selected ? getEditAvailabilityNote(selected.status) : undefined;
  const hasPreviousAttemptContext = selected ? isJobRetryable(selected.status) : false;
  const captionOutputPath = selected ? getCaptionOutputPath(selected) : undefined;

  const clearActionFeedback = () => {
    setActionMessage("");
    setActionError("");
  };

  const resetEditForm = (job?: JobRecord) => {
    setEditForm(job ? toEditForm(job) : EMPTY_EDIT_FORM);
  };

  const setJobInList = (detail: JobRecord) => {
    setJobs((current) => {
      const index = current.findIndex((job) => job.jobId === detail.jobId);
      if (index < 0) {
        return [detail, ...current];
      }
      const next = [...current];
      next[index] = detail;
      return next;
    });
  };

  const loadJobs = async (preferredId?: string) => {
    const nextJobs = await fetchJobs();
    const hasPreferred = preferredId
      ? nextJobs.some((job) => job.jobId === preferredId)
      : false;
    const nextSelectedId = hasPreferred && preferredId ? preferredId : nextJobs[0]?.jobId ?? "";
    const nextSelected = nextJobs.find((job) => job.jobId === nextSelectedId);

    setJobs(nextJobs);
    setSelectedId(nextSelectedId);

    if (!preferredId || !hasPreferred) {
      setPanelMode("view");
    }

    return nextSelected;
  };

  const syncSelectedJob = async (jobId: string) => {
    try {
      const detail = await fetchJobDetail(jobId);
      setJobInList(detail);
      setSelectedId(detail.jobId);
      return detail;
    } catch {
      return await loadJobs(jobId);
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const nextJobs = await fetchJobs();
        if (!mounted) {
          return;
        }
        setJobs(nextJobs);
        setSelectedId(nextJobs[0]?.jobId ?? "");
      } catch (loadError) {
        if (mounted) {
          setActionError((loadError as Error).message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setPanelMode("view");
      resetEditForm();
      return;
    }

    if (panelMode === "view") {
      resetEditForm(selected);
      return;
    }

    if (!isJobEditable(selected.status)) {
      setPanelMode("view");
      resetEditForm(selected);
    }
  }, [selected, panelMode]);

  const onSelectJob = async (jobId: string) => {
    setSelectedId(jobId);
    setPanelMode("view");
    try {
      const detail = await fetchJobDetail(jobId);
      setJobInList(detail);
    } catch {
      // keep list state if detail fetch fails
    }
  };

  const onOpenEdit = () => {
    if (!selected || !isJobEditable(selected.status)) {
      return;
    }
    resetEditForm(selected);
    setPanelMode("edit");
    clearActionFeedback();
  };

  const onCancelEdit = () => {
    resetEditForm(selected);
    setPanelMode("view");
  };

  const onResetEdit = () => {
    resetEditForm(selected);
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      return;
    }
    if (!editForm.title.trim() || !editForm.description.trim() || !editForm.tone.trim()) {
      setActionError("Judul, brief/deskripsi, kategori konten, gender suara, dan tone wajib diisi.");
      return;
    }

    setSaving(true);
    clearActionFeedback();
    try {
      const updated = await updateJob(selected.jobId, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        contentType: editForm.contentType,
        voiceGender: editForm.voiceGender,
        tone: editForm.tone.trim(),
        ctaText: editForm.ctaText.trim(),
        referenceLink: editForm.referenceLink.trim()
      });

      setJobInList(updated);
      setSelectedId(updated.jobId);
      resetEditForm(updated);
      setPanelMode("view");
      setActionMessage(getSaveSuccessMessage(updated.status));
    } catch (saveError) {
      const normalizedError = saveError as Error;
      if (
        (saveError instanceof ApiError && saveError.status === 409) ||
        normalizedError.message.includes("Job hanya bisa diedit")
      ) {
        await syncSelectedJob(selected.jobId);
        setPanelMode("view");
        setActionError("Job ini sudah tidak bisa diedit karena statusnya berubah.");
      } else {
        setActionError(normalizedError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    clearActionFeedback();
    try {
      const refreshed = await loadJobs(selected?.jobId);
      if (panelMode === "edit" && refreshed && !isJobEditable(refreshed.status)) {
        setPanelMode("view");
        setActionError("Job ini sudah tidak bisa diedit karena statusnya berubah.");
      }
    } catch (refreshError) {
      setActionError((refreshError as Error).message);
    }
  };

  const onRetry = async () => {
    if (!selected) {
      return;
    }
    clearActionFeedback();
    try {
      await retryJob(selected.jobId);
      await loadJobs(selected.jobId);
      setPanelMode("view");
      setActionMessage("Job dimasukkan ulang ke antrean.");
    } catch (retryError) {
      setActionError((retryError as Error).message);
    }
  };

  const onDelete = async () => {
    if (!selected) {
      return;
    }
    clearActionFeedback();
    try {
      await deleteJob(selected.jobId);
      await loadJobs();
      setPanelMode("view");
      setActionMessage("Job berhasil dihapus.");
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  };

  const onOpenLocation = async () => {
    if (!selected) {
      return;
    }
    clearActionFeedback();
    try {
      await openJobOutputLocation(selected.jobId);
      setActionMessage("Folder output dibuka.");
    } catch (openError) {
      setActionError((openError as Error).message);
    }
  };

  if (loading) {
    return (
      <section className="card">
        <h2>Jobs</h2>
        <p>Memuat daftar job...</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="job-toolbar">
        <div>
          <h2>Jobs</h2>
          <p className="section-note">Setiap job menghasilkan caption dan video final.</p>
        </div>
        <div className="form-actions">
          <button type="button" onClick={() => void onRefresh()} disabled={saving}>
            Refresh
          </button>
        </div>
      </div>

      <div className="split-layout">
        <aside className="jobs-sidebar">
          <section className="section-card">
            <div className="row-head">
              <h4>Daftar Job</h4>
              <span className="small">{jobs.length} item</span>
            </div>
            <div className="job-list">
              {jobs.length ? (
                jobs.map((job) => (
                  <button
                    type="button"
                    key={job.jobId}
                    className={selected?.jobId === job.jobId ? "tab job-item active" : "tab job-item"}
                    onClick={() => void onSelectJob(job.jobId)}
                  >
                    <strong>{job.title}</strong>
                    <div className="small">{CONTENT_LABEL[job.contentType]}</div>
                    <StatusBadge status={job.status} />
                  </button>
                ))
              ) : (
                <p className="small">Belum ada job.</p>
              )}
            </div>
          </section>
        </aside>

        <div className="detail-box">
          <div className="job-panel-header">
            <div>
              <div className="row-head">
                <h3>{panelMode === "edit" ? "Edit Job" : "Detail Job"}</h3>
                {selected ? <StatusBadge status={selected.status} /> : null}
              </div>
              <p className="section-note">
                {panelMode === "edit"
                  ? "Perbarui metadata input job. Generate ulang tetap dilakukan lewat Retry Job."
                  : "Lihat metadata input, output, dan aksi untuk job terpilih."}
              </p>
            </div>
            {panelMode === "view" && selected && canEditSelected ? (
              <div className="form-actions">
                <button type="button" onClick={onOpenEdit}>
                  Edit Job
                </button>
              </div>
            ) : null}
          </div>

          {!selected ? (
            <p>Pilih job untuk melihat detail.</p>
          ) : panelMode === "edit" ? (
            <>
              <div className="meta-grid">
                <div className="meta-card">
                  <span className="small">Judul Saat Ini</span>
                  <strong className="break-anywhere">{selected.title}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Status</span>
                  <strong>{selected.status}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Durasi</span>
                  <strong>{selected.videoDurationSec.toFixed(2)} detik</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Job ID</span>
                  <strong className="break-anywhere">#{selected.jobId}</strong>
                </div>
              </div>

              {hasPreviousAttemptContext ? (
                <div className="notice-box notice-box-warning">
                  <strong>Percobaan terakhir</strong>
                  <span>
                    Output dan error di bawah ini berasal dari percobaan terakhir. Perubahan edit baru
                    akan dipakai setelah Anda menekan Retry Job.
                  </span>
                </div>
              ) : null}

              <form className="grid-form" onSubmit={onSave}>
                <label>
                  Judul
                  <input
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, title: event.target.value }))
                    }
                    disabled={saving}
                  />
                </label>
                <label>
                  Brief / Deskripsi
                  <textarea
                    rows={5}
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, description: event.target.value }))
                    }
                    disabled={saving}
                  />
                </label>
                <div className="form-grid-2">
                  <label>
                    Kategori Konten
                    <select
                      value={editForm.contentType}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          contentType: event.target.value as ContentType
                        }))
                      }
                      disabled={saving}
                    >
                      {Object.entries(CONTENT_LABEL).map(([contentType, label]) => (
                        <option key={contentType} value={contentType}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Gender Suara
                    <select
                      value={editForm.voiceGender}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          voiceGender: event.target.value as JobVoiceGender
                        }))
                      }
                      disabled={saving}
                    >
                      {Object.entries(GENDER_LABEL).map(([gender, label]) => (
                        <option key={gender} value={gender}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-grid-2">
                  <label>
                    Tone
                    <select
                      value={editForm.tone}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, tone: event.target.value }))
                      }
                      disabled={saving}
                    >
                      {TONE_OPTIONS.map((tone) => (
                        <option key={tone} value={tone}>
                          {tone}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    CTA Opsional
                    <input
                      value={editForm.ctaText}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, ctaText: event.target.value }))
                      }
                      disabled={saving}
                    />
                  </label>
                </div>
                <label>
                  Reference Link Opsional
                  <input
                    value={editForm.referenceLink}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        referenceLink: event.target.value
                      }))
                    }
                    disabled={saving}
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={saving}>
                    {saving ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                  <button type="button" onClick={onResetEdit} disabled={saving}>
                    Reset Form
                  </button>
                  <button type="button" onClick={onCancelEdit} disabled={saving}>
                    Batal
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="meta-grid">
                <div className="meta-card">
                  <span className="small">Judul</span>
                  <strong className="break-anywhere">{selected.title}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Kategori</span>
                  <strong>{CONTENT_LABEL[selected.contentType]}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Gender Suara</span>
                  <strong>{GENDER_LABEL[selected.voiceGender]}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Tone</span>
                  <strong>{selected.tone}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Durasi</span>
                  <strong>{selected.videoDurationSec.toFixed(2)} detik</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Job ID</span>
                  <strong className="break-anywhere">#{selected.jobId}</strong>
                </div>
              </div>

              {hasPreviousAttemptContext ? (
                <div className="notice-box notice-box-warning">
                  <strong>Percobaan terakhir</strong>
                  <span>
                    Output dan error di bawah ini berasal dari percobaan terakhir. Simpan perubahan edit
                    terlebih dahulu, lalu klik Retry Job untuk memproses ulang dengan metadata terbaru.
                  </span>
                </div>
              ) : null}

              {editAvailabilityNote ? <p className="section-note">{editAvailabilityNote}</p> : null}

              <p className="break-anywhere">
                <strong>Brief:</strong> {selected.description}
              </p>
              {selected.ctaText ? (
                <p className="break-anywhere">
                  <strong>CTA:</strong> {selected.ctaText}
                </p>
              ) : null}
              {selected.referenceLink ? (
                <p className="break-anywhere">
                  <strong>Reference Link:</strong> {selected.referenceLink}
                </p>
              ) : null}

              {selected.errorMessage ? (
                <div className="notice-box notice-box-danger">
                  <strong>Error proses terakhir</strong>
                  <span className="break-anywhere">{selected.errorMessage}</span>
                </div>
              ) : null}

              {captionOutputPath || selected.output.voicePath || selected.output.finalVideoPath ? (
                <div className="output-links">
                  {captionOutputPath ? (
                    <a href={toAbsoluteOutputUrl(captionOutputPath)} target="_blank" rel="noreferrer">
                      Caption
                    </a>
                  ) : null}
                  {selected.output.voicePath ? (
                    <a href={toAbsoluteOutputUrl(selected.output.voicePath)} target="_blank" rel="noreferrer">
                      Audio
                    </a>
                  ) : null}
                  {selected.output.finalVideoPath ? (
                    <a
                      href={toAbsoluteOutputUrl(selected.output.finalVideoPath)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Final Video
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="small">Belum ada file output untuk job ini.</p>
              )}

              <div className="form-actions section-divider">
                <button type="button" onClick={() => void onOpenLocation()}>
                  Buka Folder Output
                </button>
                <button type="button" onClick={() => void onRetry()} disabled={!canRetrySelected}>
                  Retry Job
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void onDelete()}
                  disabled={selected.status === "running"}
                >
                  Hapus Job
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {actionMessage && <p className="ok-text">{actionMessage}</p>}
      {actionError && <p className="err-text">{actionError}</p>}
    </section>
  );
}
