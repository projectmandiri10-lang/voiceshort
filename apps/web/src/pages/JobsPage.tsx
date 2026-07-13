import { useEffect, useMemo, useState } from "react";
import { Download, FolderClock, RefreshCw, Sparkles, Video } from "lucide-react";
import { fetchGenerationSession, fetchGenerationSessions } from "../api";
import { listCachedSessionIds, getCachedSessionAssets } from "../generation-cache";
import {
  getContentLabel,
  getGenderLabel,
  getPlatformLabel,
  getScriptModeLabel,
  getSubtitleModeLabel
} from "../job-form-options";
import type { AuthUser, ContentLanguage, GenerationSessionRecord } from "../types";
import { formatDateTime, formatDurationSeconds, formatIdrCurrency } from "../user-locale";
import { getUserCopy } from "../user-copy";

interface JobsPageProps {
  locale: ContentLanguage;
  currentUser: AuthUser;
  selectedJobId?: string;
  onSelectJob: (jobId: string) => void;
  onResumeSession: (jobId: string) => void;
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
  locale,
  currentUser,
  selectedJobId,
  onSelectJob,
  onResumeSession
}: JobsPageProps) {
  const copy = getUserCopy(locale);
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
        throw new Error(locale === "id-ID" ? "Final video lokal belum ada di perangkat ini." : "The final local video is not available on this device yet.");
      }
      downloadBlob(
        cache.renderedVideoBlob,
        cache.renderFileName || `${selected.title || "voiceover"}-final.mp4`
      );
      setActionMessage(locale === "id-ID" ? "Final video berhasil diunduh ulang." : "The final video was downloaded again successfully.");
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
        <h2>{copy.jobs.loadingTitle}</h2>
        <p>{copy.jobs.loadingLead}</p>
      </section>
    );
  }

  const hasLocalCache = selected ? cachedSessionIds.includes(selected.sessionId) : false;
  const canResumeLocally = Boolean(selected && hasLocalCache && selected.status !== "completed");
  const hasLocalFinalVideo = Boolean(selected && selected.status === "completed" && hasLocalCache);

  return (
    <section className="card app-page-card">
      <div className="job-toolbar">
        <div>
          <span className="eyebrow">{copy.jobs.eyebrow}</span>
          <h2>{copy.jobs.title}</h2>
          <p className="section-note">{copy.jobs.lead}</p>
        </div>
        <div className="form-actions">
          <button type="button" onClick={() => void onRefresh()}>
            <RefreshCw size={16} />
            <span>{copy.jobs.refresh}</span>
          </button>
        </div>
      </div>

      <div className="split-layout">
        <aside className="jobs-sidebar">
          <section className="section-card">
            <div className="row-head">
              <div>
                <h4>{copy.jobs.listTitle}</h4>
                <p className="small">{copy.jobs.items(sessions.length)}</p>
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
                        <span className="session-mode-badge">
                          {getScriptModeLabel(locale, session.scriptMode)}
                        </span>
                        <span className="small">{getContentLabel(locale, session.contentType)}</span>
                        <span className="small">{getPlatformLabel(locale, session.socialPlatform)}</span>
                        <span className="small">{formatDateTime(session.updatedAt, locale)}</span>
                        <span className="small">{isCached ? copy.jobs.cachedDraft : copy.jobs.noCache}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="small">{copy.jobs.empty}</p>
              )}
            </div>
          </section>
        </aside>

        <div className="detail-box">
          {!selected ? (
            <p>{copy.jobs.selectPrompt}</p>
          ) : (
            <>
              <div className="job-panel-header">
                <div className="row-head">
                  <div>
                    <span className="eyebrow">{copy.jobs.detailEyebrow}</span>
                    <h3>{copy.jobs.detailTitle}</h3>
                    <p className="section-note">{copy.jobs.detailLead}</p>
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
                  <span>
                    {selected.scriptMode === "manual_script"
                      ? copy.jobs.manualScript
                      : copy.jobs.clips(selected.frameCount)}
                  </span>
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
                  <p className="ok-text">{copy.jobs.localDraftAvailable}</p>
                ) : (
                  <p className="small">{copy.jobs.localDraftUnavailable}</p>
                )}
              </div>

              <div className="meta-grid">
                <div className="meta-card">
                  <span className="small">{copy.jobs.mode}</span>
                  <strong>{getScriptModeLabel(locale, selected.scriptMode)}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">{locale === "id-ID" ? "Judul" : "Title"}</span>
                  <strong className="break-anywhere">{selected.title}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">{copy.jobs.category}</span>
                  <strong>{getContentLabel(locale, selected.contentType)}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">{copy.jobs.platform}</span>
                  <strong>{getPlatformLabel(locale, selected.socialPlatform)}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">{copy.jobs.voiceGender}</span>
                  <strong>{getGenderLabel(locale, selected.voiceGender)}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">{copy.jobs.subtitleMode}</span>
                  <strong>
                    {getSubtitleModeLabel(
                      locale,
                      selected.includeSubtitles ? "with_subtitles" : "without_subtitles"
                    )}
                  </strong>
                </div>
                <div className="meta-card">
                  <span className="small">{copy.jobs.tone}</span>
                  <strong>{selected.tone}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">{copy.jobs.videoDuration}</span>
                  <strong>{formatDurationSeconds(selected.videoDurationSec, locale)}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">{copy.jobs.cost}</span>
                  <strong>
                    {currentUser.isUnlimited
                      ? copy.dashboard.unlimited
                      : formatIdrCurrency(selected.chargedAmountIdr || currentUser.generatePriceIdr, locale)}
                  </strong>
                </div>
              </div>

              <p className="break-anywhere">
                <strong>{copy.jobs.brief}:</strong> {selected.description}
              </p>
              {selected.ctaText ? (
                <p className="break-anywhere">
                  <strong>{copy.jobs.cta}:</strong> {selected.ctaText}
                </p>
              ) : null}
              {selected.referenceLink ? (
                <p className="break-anywhere">
                  <strong>{copy.jobs.reference}:</strong> {selected.referenceLink}
                </p>
              ) : null}

              {selected.scriptText ? (
                <div className="notice-box">
                  <div className="row-head">
                    <strong>{copy.jobs.scriptTitle}</strong>
                    <Sparkles size={16} />
                  </div>
                  <p className="break-anywhere">{selected.scriptText}</p>
                </div>
              ) : null}

              {selected.captionText ? (
                <div className="notice-box">
                  <div className="row-head">
                    <strong>{copy.jobs.captionTitle}</strong>
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
                    <span className="small">{copy.jobs.finalized}</span>
                    <strong>{selected.renderSummary.renderedAt ? copy.jobs.completed : copy.jobs.notYet}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">{copy.jobs.fileSize}</span>
                    <strong>
                      {selected.renderSummary.finalSizeBytes
                        ? `${(selected.renderSummary.finalSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                        : "-"}
                    </strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">{copy.jobs.finalDuration}</span>
                    <strong>
                      {selected.renderSummary.finalDurationSec
                        ? formatDurationSeconds(selected.renderSummary.finalDurationSec, locale)
                        : "-"}
                    </strong>
                  </div>
                </div>
              ) : null}

              <div className="form-actions section-divider">
                <button type="button" onClick={() => onResumeSession(selected.sessionId)}>
                  <Video size={16} />
                  <span>{copy.jobs.openWorkspace}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onResumeSession(selected.sessionId)}
                  disabled={!canResumeLocally}
                >
                  <Sparkles size={16} />
                  <span>{canResumeLocally ? copy.jobs.continueFinalize : copy.jobs.localDraftNeeded}</span>
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void onDownloadCachedVideo()}
                  disabled={!hasLocalFinalVideo}
                >
                  <Download size={16} />
                  <span>{hasLocalFinalVideo ? copy.jobs.downloadFinal : copy.jobs.finalUnavailable}</span>
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
