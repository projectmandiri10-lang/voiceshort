import { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { fetchGenerationSession, fetchGenerationSessions } from "../api";
import type { ContentLanguage, GenerationSessionRecord } from "../types";
import { formatDateTime, formatDurationSeconds } from "../user-locale";

interface JobsPageProps {
  locale: ContentLanguage;
  selectedJobId?: string;
  onSelectJob: (jobId: string) => void;
}

export function JobsPage({ locale, selectedJobId, onSelectJob }: JobsPageProps) {
  const [sessions, setSessions] = useState<GenerationSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(
    () => sessions.find((item) => item.sessionId === selectedJobId) || sessions[0],
    [sessions, selectedJobId]
  );

  const load = async () => {
    const items = await fetchGenerationSessions();
    setSessions(items);
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

  if (loading) return <section className="card app-page-card"><h2>Memuat riwayat...</h2></section>;

  return (
    <section className="personal-history">
      <header className="personal-workspace-head">
        <div><span className="eyebrow">RIWAYAT PERSONAL</span><h1>Riwayat naskah</h1><p>Buka kembali Scene, Sample Context, naskah, caption, dan hashtag dari setiap hasil generate.</p></div>
        <button type="button" className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
      </header>
      <div className="split-layout">
        <aside className="jobs-sidebar">
          <div className="job-list">
            {sessions.map((item) => (
              <button key={item.sessionId} className={item.sessionId === selected?.sessionId ? "job-item active" : "job-item"} onClick={() => void refreshOne(item.sessionId)}>
                <strong>{item.title}</strong>
                <span className="small">{formatDateTime(item.updatedAt, locale)}</span>
                <span className="small">{item.status === "failed" ? "Gagal" : "Selesai"}</span>
              </button>
            ))}
            {!sessions.length ? <p>Belum ada naskah.</p> : null}
          </div>
        </aside>
        <div className="detail-box">
          {selected ? (
            <div className="personal-step-content">
              <div className="personal-result-head"><div><h2>{selected.title}</h2><p>{formatDurationSeconds(selected.videoDurationSec, locale)} - {selected.status === "failed" ? "Gagal" : "Selesai"}</p></div><Sparkles size={22} /></div>
              <article className="copy-result-card ai-studio-guide-card">
                <header><strong>AI Studio - The Ad Voiceover</strong></header>
                <p>Tempel Scene, Sample Context, dan Naskah ini ke AI Studio pada bagian The Ad Voiceover.</p>
              </article>
              {([[
                "Scene", selected.sceneText
              ], [
                "Sample Context", selected.sampleContextText
              ], [
                "Naskah", selected.scriptText
              ], [
                "Caption", selected.captionText
              ], [
                "Hashtag", selected.hashtags.join(" ")
              ]] as const).map(([label, value]) => (
                <article className="copy-result-card" key={label}><header><strong>{label}</strong><button onClick={() => void copy(value, label)}><Clipboard size={15} /> Salin</button></header><p>{value}</p></article>
              ))}
              {selected.referenceLink ? <a href={selected.referenceLink} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {selected.referenceLink}</a> : null}
            </div>
          ) : <p>Pilih naskah.</p>}
        </div>
      </div>
      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
