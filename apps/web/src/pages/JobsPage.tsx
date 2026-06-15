import { useEffect, useMemo, useState } from "react";
import { Download, FolderClock, RefreshCw, Sparkles, Video } from "lucide-react";
import { fetchGenerationSession, fetchGenerationSessions } from "../api";
import { listCachedSessionIds, getCachedSessionAssets } from "../generation-cache";
import { CONTENT_LABEL, GENDER_LABEL, PLATFORM_LABEL } from "../job-form-options";
import type { AuthUser, GenerationSessionRecord } from "../types";

interface JobsPageProps {
  currentUser: AuthUser;
  selectedJobId?: string;
  onSelectJob: (jobId: string) => void;
  onResumeSession: (jobId: string) => void;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function JobsPage({
  currentUser,
  selectedJobId,
  onSelectJob,
  onResumeSession
}: JobsPageProps) {
  const [sessions, setSessions] = useState<GenerationSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [cachedSessionIds, setCachedSessionIds] = useState<string[]>([]);

  const selected = useMemo(() => {
    if (!sessions.length) {
      return undefined;
    }
    return sessions.find((session) => session.sessionId === selectedJobId) ?? sessions[0];
  }, [sessions, selectedJobId]);

  const loadSessions = async (preferredSessionId?: string) => {
    const [nextSessions, nextCacheIds] = await Promise.all([
      fetchGenerationSessions(),
      listCachedSessionIds().catch(() => [])
    ]);
    setSessions(nextSessions);
    setCachedSessionIds(nextCacheIds);
    const nextSelected =
      nextSessions.find((session) => session.sessionId === preferredSessionId) ??
      nextSessions.find((session) => session.sessionId === selectedJobId) ??
      nextSessions[0];
    if (nextSelected && nextSelected.sessionId !== selectedJobId) {
      onSelectJob(nextSelected.sessionId);
    }
    return nextSelected;
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadSessions()
      .catch((loadError) => {
        if (mounted) {
          setActionError((loadError as Error).message);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [onSelectJob, selectedJobId]);

  const onRefresh = async () => {
    setActionMessage("");
    setActionError("");
    try {
      await loadSessions(selected?.sessionId);
    } catch (refreshError) {
      setActionError((refreshError as Error).message);
    }
  };

  const onDownloadCachedVideo = async () => {
    if (!selected) {
      return;
    }
    setActionError("");
    setActionMessage("");
    try {
      const cache = await getCachedSessionAssets(selected.sessionId);
      if (!cache?.renderedVideoBlob) {
        throw new Error("Final video lokal belum ada di perangkat ini.");
      }
      downloadBlob(
        cache.renderedVideoBlob,
        cache.renderFileName || `${selected.title || "voiceover"}-final.mp4`
      );
      setActionMessage("Final video berhasil diunduh ulang.");
    } catch (downloadError) {
      setActionError((downloadError as Error).message);
    }
  };

  const onOpenSession = async (sessionId: string) => {
    setActionError("");
    setActionMessage("");
    try {
      const refreshed = await fetchGenerationSession(sessionId);
      setSessions((current) =>
        current.map((session) => (session.sessionId === sessionId ? refreshed : session))
      );
      onSelectJob(sessionId);
    } catch (detailError) {
      setActionError((detailError as Error).message);
    }
  };

  if (loading) {
    return (
      <section className="card app-page-card">
        <h2>Riwayat Session</h2>
        <p>Memuat riwayat session...</p>
      </section>
    );
  }

  const hasLocalCache = selected ? cachedSessionIds.includes(selected.sessionId) : false;
  const canResumeLocally = Boolean(
    selected && hasLocalCache && selected.status !== "completed"
  );
  const hasLocalFinalVideo = Boolean(
    selected && selected.status === "completed" && hasLocalCache
  );

  return (
    <section className="card app-page-card">
      <div className="job-toolbar">
        <div>
          <span className="eyebrow">Riwayat Session</span>
          <h2>Riwayat Generate</h2>
          <p className="section-note">
            Lihat hasil AI, status proses, dan lanjutkan session dari perangkat yang sama.
          </p>
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
                <h4>Daftar Session</h4>
                <p className="small">{sessions.length} item</p>
              </div>
            </div>

            <div className="job-list">
              {sessions.length ? (
                sessions.map((session) => {
                  const isActive = selected?.sessionId === session.sessionId;
                  const isCached = cachedSessionIds.includes(session.sessionId);
                  return (
                    <button
                      type="button"
                      key={session.sessionId}
                      className={isActive ? "job-item active" : "job-item"}
                      onClick={() => void onOpenSession(session.sessionId)}
                    >
                      <div className="grid-form">
                        <div className="row-head">
                          <strong>{session.title}</strong>
                          <span
                            className={
                              session.status === "completed"
                                ? "status status-success"
                                : session.status === "failed"
                                  ? "status status-failed"
                                  : "status status-running"
                            }
                          >
                            {session.status}
                          </span>
                        </div>
                        <span className="small">{CONTENT_LABEL[session.contentType]}</span>
                        <span className="small">{PLATFORM_LABEL[session.socialPlatform]}</span>
                        <span className="small">{formatDateTime(session.updatedAt)}</span>
                        <span className="small">
                          {isCached ? "Draft lokal tersedia" : "Tanpa cache lokal"}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="small">Belum ada session yang tersimpan.</p>
              )}
            </div>
          </section>
        </aside>

        <div className="detail-box">
          {!selected ? (
            <p>Pilih session untuk melihat detailnya.</p>
          ) : (
            <>
              <div className="job-panel-header">
                <div className="row-head">
                  <div>
                    <span className="eyebrow">Detail Session</span>
                    <h3>Detail Generate</h3>
                    <p className="section-note">
                      Final video disimpan di perangkat yang sama, bukan di server pusat.
                    </p>
                  </div>
                  <span
                    className={
                      selected.status === "completed"
                        ? "status status-success"
                        : selected.status === "failed"
                          ? "status status-failed"
                          : "status status-running"
                    }
                  >
                    {selected.status}
                  </span>
                </div>
              </div>

              <div className="progress-card">
                <div className="row-head">
                  <strong>{selected.title}</strong>
                  <span>{selected.frameCount} cuplikan</span>
                </div>
                <div className="progress-track" aria-label="Session status">
                  <div
                    className="progress-value"
                    style={{
                      width:
                        selected.status === "completed"
                          ? "100%"
                          : selected.status === "ready_for_render"
                            ? "78%"
                            : selected.status === "ready_for_audio"
                              ? "56%"
                              : selected.status === "failed"
                                ? "100%"
                                : "24%"
                    }}
                  />
                </div>
                {selected.errorMessage ? (
                  <p className="err-text break-anywhere">{selected.errorMessage}</p>
                ) : null}
                {hasLocalCache ? (
                  <p className="ok-text">Perangkat ini masih menyimpan draft lokal untuk session ini.</p>
                ) : (
                  <p className="small">
                    Tidak ada cache lokal di perangkat ini. Anda masih bisa melihat hasil AI, tetapi tidak
                    bisa render ulang tanpa upload video lagi.
                  </p>
                )}
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
                  <span className="small">Platform</span>
                  <strong>{PLATFORM_LABEL[selected.socialPlatform]}</strong>
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
                  <span className="small">Durasi Video</span>
                  <strong>{selected.videoDurationSec.toFixed(2)} detik</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Biaya</span>
                  <strong>
                    {currentUser.isUnlimited
                      ? "Unlimited"
                      : formatRupiah(selected.chargedAmountIdr || currentUser.generatePriceIdr)}
                  </strong>
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

              {selected.scriptText ? (
                <div className="notice-box">
                  <div className="row-head">
                    <strong>Naskah Voice Over</strong>
                    <Sparkles size={16} />
                  </div>
                  <p className="break-anywhere">{selected.scriptText}</p>
                </div>
              ) : null}

              {selected.captionText ? (
                <div className="notice-box">
                  <div className="row-head">
                    <strong>Caption Sosial</strong>
                    <FolderClock size={16} />
                  </div>
                  <p className="break-anywhere">{selected.captionText}</p>
                  {selected.hashtags.length ? (
                    <p className="small break-anywhere">{selected.hashtags.join(" ")}</p>
                  ) : null}
                </div>
              ) : null}

              {selected.renderSummary ? (
                <div className="meta-grid">
                  <div className="meta-card">
                    <span className="small">Finalisasi</span>
                    <strong>{selected.renderSummary.renderedAt ? "Selesai" : "Belum ada"}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">Ukuran File</span>
                    <strong>
                      {selected.renderSummary.finalSizeBytes
                        ? `${(selected.renderSummary.finalSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                        : "-"}
                    </strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">Durasi Final</span>
                    <strong>
                      {selected.renderSummary.finalDurationSec
                        ? `${selected.renderSummary.finalDurationSec.toFixed(2)} detik`
                        : "-"}
                    </strong>
                  </div>
                </div>
              ) : null}

              <div className="form-actions section-divider">
                <button type="button" onClick={() => onResumeSession(selected.sessionId)}>
                  <Video size={16} />
                  <span>Buka di Workspace Generate</span>
                </button>
                <button
                  type="button"
                  onClick={() => onResumeSession(selected.sessionId)}
                  disabled={!canResumeLocally}
                >
                  <Sparkles size={16} />
                  <span>{canResumeLocally ? "Lanjutkan Finalisasi" : "Perlu Draft Lokal"}</span>
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void onDownloadCachedVideo()}
                  disabled={!hasLocalFinalVideo}
                >
                  <Download size={16} />
                  <span>{hasLocalFinalVideo ? "Unduh Final" : "Final Belum Ada"}</span>
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
