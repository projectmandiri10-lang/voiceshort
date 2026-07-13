import { useEffect, useMemo, useState } from "react";
import { Clipboard, Download, ExternalLink, RefreshCw, Sparkles, Video } from "lucide-react";
import { fetchGenerationSession, fetchGenerationSessions } from "../api";
import { getCachedSessionAssets, listCachedSessionIds } from "../generation-cache";
import type { AuthUser, ContentLanguage, GenerationSessionRecord } from "../types";
import { formatDateTime, formatDurationSeconds } from "../user-locale";

interface JobsPageProps {
  locale: ContentLanguage;
  currentUser: AuthUser;
  selectedJobId?: string;
  onSelectJob: (jobId: string) => void;
  onResumeSession: (jobId: string) => void;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function JobsPage({ locale, selectedJobId, onSelectJob, onResumeSession }: JobsPageProps) {
  const [sessions, setSessions] = useState<GenerationSessionRecord[]>([]);
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(
    () => sessions.find((item) => item.sessionId === selectedJobId) || sessions[0],
    [sessions, selectedJobId]
  );

  const load = async () => {
    const [items, ids] = await Promise.all([fetchGenerationSessions(), listCachedSessionIds().catch(() => [])]);
    setSessions(items);
    setCachedIds(ids);
    if (!selectedJobId && items[0]) onSelectJob(items[0].sessionId);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void load().catch((value) => mounted && setError((value as Error).message)).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const refreshOne = async (id: string) => {
    const value = await fetchGenerationSession(id);
    setSessions((current) => current.map((item) => item.sessionId === id ? value : item));
    onSelectJob(id);
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setMessage(`${label} disalin.`);
  };

  const downloadFinal = async () => {
    if (!selected) return;
    const cache = await getCachedSessionAssets(selected.sessionId);
    if (!cache?.renderedVideoBlob) throw new Error("Video final hanya tersedia di perangkat tempat render dilakukan.");
    download(cache.renderedVideoBlob, cache.renderFileName || `${selected.title}-final.mp4`);
  };

  if (loading) return <section className="card app-page-card"><h2>Memuat riwayat...</h2></section>;

  return (
    <section className="personal-history">
      <header className="personal-workspace-head">
        <div><span className="eyebrow">RIWAYAT PERSONAL</span><h1>Session analisis</h1><p>Lanjutkan upload voice pada perangkat yang masih menyimpan video sumber.</p></div>
        <button type="button" className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
      </header>
      <div className="split-layout">
        <aside className="jobs-sidebar">
          <div className="job-list">
            {sessions.map((item) => (
              <button key={item.sessionId} className={item.sessionId === selected?.sessionId ? "job-item active" : "job-item"} onClick={() => void refreshOne(item.sessionId)}>
                <strong>{item.title}</strong>
                <span className="small">{formatDateTime(item.updatedAt, locale)}</span>
                <span className="small">{item.status === "ready_for_voice_upload" ? "Menunggu voice" : item.status}</span>
              </button>
            ))}
            {!sessions.length ? <p>Belum ada session.</p> : null}
          </div>
        </aside>
        <div className="detail-box">
          {selected ? (
            <div className="personal-step-content">
              <div className="personal-result-head"><div><h2>{selected.title}</h2><p>{formatDurationSeconds(selected.videoDurationSec, locale)} · {selected.status}</p></div><Sparkles size={22} /></div>
              {([
                ["Scene", selected.sceneText],
                ["Sample Context", selected.sampleContextText],
                ["Naskah", selected.scriptText]
              ] as const).map(([label, value]) => <article className="copy-result-card" key={label}><header><strong>{label}</strong><button onClick={() => void copy(value, label)}><Clipboard size={15} /> Salin</button></header><p>{value}</p></article>)}
              {selected.status === "completed" ? <>
                <article className="copy-result-card"><header><strong>Caption</strong><button onClick={() => void copy(selected.captionText, "Caption")}><Clipboard size={15} /> Salin</button></header><p>{selected.captionText}</p></article>
                <article className="copy-result-card"><header><strong>Hashtag</strong><button onClick={() => void copy(selected.hashtags.join(" "), "Hashtag")}><Clipboard size={15} /> Salin</button></header><p>{selected.hashtags.join(" ")}</p></article>
                {selected.referenceLink ? <a href={selected.referenceLink} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {selected.referenceLink}</a> : null}
              </> : null}
              <div className="personal-actions">
                {selected.status !== "completed" && cachedIds.includes(selected.sessionId) ? <button onClick={() => onResumeSession(selected.sessionId)}><Video size={16} /> Lanjutkan</button> : null}
                {selected.status === "completed" && cachedIds.includes(selected.sessionId) ? <button onClick={() => void downloadFinal().catch((value) => setError((value as Error).message))}><Download size={16} /> Download MP4</button> : null}
              </div>
            </div>
          ) : <p>Pilih session.</p>}
        </div>
      </div>
      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
