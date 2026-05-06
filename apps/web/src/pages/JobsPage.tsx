import { useEffect, useMemo, useState } from "react";
import { FolderOpen, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteJob,
  fetchJobDetail,
  fetchJobs,
  openJobOutputLocation,
  resolveOutputUrl,
  retryJob,
  subscribeToJobEvents,
} from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { CONTENT_LABEL, GENDER_LABEL } from "../job-form-options";
import type { JobRecord } from "../types";

interface JobsPageProps {
  selectedJobId?: string;
  onSelectJob: (jobId: string) => void;
}

function getCaptionOutputPath(job: JobRecord): string | undefined {
  return job.output.captionPath || job.output.scriptPath;
}

function upsertJob(current: JobRecord[], nextJob: JobRecord): JobRecord[] {
  const index = current.findIndex((job) => job.jobId === nextJob.jobId);
  if (index < 0) {
    return [nextJob, ...current];
  }
  const next = [...current];
  next[index] = nextJob;
  return next;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function JobsPage({ selectedJobId, onSelectJob }: JobsPageProps) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [displayPercent, setDisplayPercent] = useState(0);

  const selected = useMemo(() => {
    if (!jobs.length) {
      return undefined;
    }
    return jobs.find((job) => job.jobId === selectedJobId) ?? jobs[0];
  }, [jobs, selectedJobId]);

  const selectedPercent = selected?.progress.percent ?? 0;
  const isLiveStatus = selected?.status === "queued" || selected?.status === "running";
  const captionOutputPath = selected ? getCaptionOutputPath(selected) : undefined;

  const loadJobs = async (preferredJobId?: string) => {
    const nextJobs = await fetchJobs();
    setJobs(nextJobs);
    const nextSelected =
      nextJobs.find((job) => job.jobId === preferredJobId) ??
      nextJobs.find((job) => job.jobId === selectedJobId) ??
      nextJobs[0];
    if (nextSelected && nextSelected.jobId !== selectedJobId) {
      onSelectJob(nextSelected.jobId);
    }
    return nextSelected;
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
        const nextSelected = nextJobs.find((job) => job.jobId === selectedJobId) ?? nextJobs[0];
        if (nextSelected && nextSelected.jobId !== selectedJobId) {
          onSelectJob(nextSelected.jobId);
        }
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
  }, [onSelectJob, selectedJobId]);

  useEffect(() => {
    setDisplayPercent((current) => (current > selectedPercent ? selectedPercent : current));
  }, [selected?.jobId, selectedPercent]);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, selectedPercent));
    const timer = window.setInterval(() => {
      setDisplayPercent((current) => {
        if (Math.abs(target - current) < 1) {
          return target;
        }
        return current + Math.max(1, Math.ceil((target - current) / 5));
      });
    }, 60);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedPercent]);

  useEffect(() => {
    if (!selected || !isLiveStatus) {
      return;
    }

    let stopPolling: number | undefined;
    const unsubscribe = subscribeToJobEvents(selected.jobId, {
      onJob: (nextJob) => {
        setJobs((current) => upsertJob(current, nextJob));
      },
      onError: () => {
        unsubscribe();
        if (stopPolling) {
          return;
        }
        stopPolling = window.setInterval(async () => {
          try {
            const refreshed = await fetchJobDetail(selected.jobId);
            setJobs((current) => upsertJob(current, refreshed));
            if (refreshed.status !== "queued" && refreshed.status !== "running" && stopPolling) {
              window.clearInterval(stopPolling);
            }
          } catch {
            // keep fallback polling silent
          }
        }, 5000);
      },
    });

    return () => {
      unsubscribe();
      if (stopPolling) {
        window.clearInterval(stopPolling);
      }
    };
  }, [isLiveStatus, selected]);

  const onRefresh = async () => {
    setActionMessage("");
    setActionError("");
    try {
      await loadJobs(selected?.jobId);
    } catch (refreshError) {
      setActionError((refreshError as Error).message);
    }
  };

  const onRetry = async () => {
    if (!selected) {
      return;
    }
    setActionMessage("");
    setActionError("");
    try {
      await retryJob(selected.jobId);
      await loadJobs(selected.jobId);
      setActionMessage("Proses dimasukkan ulang ke antrean.");
    } catch (retryError) {
      setActionError((retryError as Error).message);
    }
  };

  const onDelete = async () => {
    if (!selected) {
      return;
    }
    setActionMessage("");
    setActionError("");
    try {
      await deleteJob(selected.jobId);
      const nextSelected = await loadJobs();
      if (!nextSelected) {
        setActionMessage("Proses berhasil dihapus.");
        return;
      }
      setActionMessage("Proses berhasil dihapus.");
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  };

  const onOpenLocation = async () => {
    if (!selected) {
      return;
    }
    setActionMessage("");
    setActionError("");
    try {
      await openJobOutputLocation(selected.jobId);
      setActionMessage("Folder output dibuka.");
    } catch (openError) {
      setActionError((openError as Error).message);
    }
  };

  if (loading) {
    return (
      <section className="card app-page-card">
        <h2>Riwayat Proses</h2>
        <p>Memuat riwayat proses...</p>
      </section>
    );
  }

  return (
    <section className="card app-page-card">
      <div className="job-toolbar">
        <div>
          <span className="eyebrow">Riwayat</span>
          <h2>Riwayat Proses</h2>
          <p className="section-note">Pantau progress voice over dan unduh hasilnya saat sudah selesai.</p>
        </div>
        <div className="form-actions">
          <button type="button" onClick={() => void onRefresh()}>
            <RefreshCw size={16} />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      <div className="split-layout">
        <aside className="jobs-sidebar">
          <section className="section-card">
            <div className="row-head">
              <div>
                <h4>Daftar Proses</h4>
                <p className="small">{jobs.length} item</p>
              </div>
            </div>

            <div className="job-list">
              {jobs.length ? (
                jobs.map((job) => (
                  <button
                    type="button"
                    key={job.jobId}
                    className={selected?.jobId === job.jobId ? "job-item active" : "job-item"}
                    onClick={() => onSelectJob(job.jobId)}
                  >
                    <div className="grid-form">
                      <div className="row-head">
                        <strong>{job.title}</strong>
                        <StatusBadge status={job.status} />
                      </div>
                      <span className="small">{CONTENT_LABEL[job.contentType]}</span>
                      <span className="small">{formatDateTime(job.updatedAt)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="small">Belum ada proses yang tersimpan.</p>
              )}
            </div>
          </section>
        </aside>

        <div className="detail-box">
          {!selected ? (
            <p>Pilih proses untuk melihat detailnya.</p>
          ) : (
            <>
              <div className="job-panel-header">
                <div className="row-head">
                  <div>
                    <span className="eyebrow">Detail</span>
                    <h3>Detail Proses</h3>
                    <p className="section-note">
                      Progress akan bergerak otomatis selama proses masih berjalan.
                    </p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              <div className="progress-card">
                <div className="row-head">
                  <strong>{selected.progress.label}</strong>
                  <span>{Math.round(displayPercent)}%</span>
                </div>
                <div className="progress-track" aria-label="Job progress">
                  <div className="progress-value" style={{ width: `${displayPercent}%` }} />
                </div>
                {selected.status === "success" ? (
                  <p className="ok-text">Voice over selesai dibuat. File hasil siap diunduh.</p>
                ) : null}
                {selected.errorMessage ? <p className="err-text break-anywhere">{selected.errorMessage}</p> : null}
              </div>

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
                  <span className="small">ID Proses</span>
                  <strong className="break-anywhere">#{selected.jobId}</strong>
                </div>
              </div>

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
                  <strong>Link Referensi:</strong> {selected.referenceLink}
                </p>
              ) : null}

              {captionOutputPath || selected.output.finalVideoPath ? (
                <div className="output-links">
                  {captionOutputPath ? (
                    <a href={resolveOutputUrl(captionOutputPath)} target="_blank" rel="noreferrer">
                      Download Caption
                    </a>
                  ) : null}
                  {selected.output.finalVideoPath ? (
                    <a href={resolveOutputUrl(selected.output.finalVideoPath)} target="_blank" rel="noreferrer">
                      Download Final Video
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="small">File output akan muncul otomatis saat proses selesai.</p>
              )}

              <div className="form-actions section-divider">
                <button type="button" onClick={() => void onOpenLocation()}>
                  <FolderOpen size={16} />
                  <span>Buka Folder Output</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onRetry()}
                  disabled={selected.status !== "failed" && selected.status !== "interrupted"}
                >
                  <RotateCcw size={16} />
                  <span>Coba Lagi</span>
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void onDelete()}
                  disabled={selected.status === "running"}
                >
                  <Trash2 size={16} />
                  <span>Hapus Proses</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {actionMessage ? <p className="ok-text">{actionMessage}</p> : null}
      {actionError ? <p className="err-text">{actionError}</p> : null}
    </section>
  );
}
