import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2, Clipboard, Download, ExternalLink, FileAudio, FolderClock,
  Link2, LoaderCircle, Sparkles, UploadCloud, Video
} from "lucide-react";
import {
  completeGenerationSession, createGenerationSession, failGenerationSession,
  fetchGenerationSession
} from "../api";
import { extractFramesFromVideo } from "../frame-extractor";
import { getCachedSessionAssets, upsertCachedSessionAssets } from "../generation-cache";
import {
  getContentLabel, getPlatformLabel, getSubtitleModeLabel, getToneLabel,
  PLATFORM_OPTIONS, SUBTITLE_MODE_OPTIONS, TONE_OPTIONS
} from "../job-form-options";
import { renderFinalVideoLocally } from "../local-render";
import { readBlobDuration } from "../media-utils";
import type {
  ContentLanguage, ContentType, GenerationSessionRecord, SocialPlatform, SubtitleMode
} from "../types";
import { CONTENT_TYPES } from "../types";
import { readVideoDuration } from "../video-duration";
import { formatVideoDuration } from "../utils/billing";

const AI_STUDIO_URL = "https://aistudio.google.com/generate-speech";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_ACCEPT = ".wav,.mp3,.m4a,.mp4,.ogg,audio/wav,audio/mpeg,audio/mp4,audio/ogg";

interface GeneratePageProps {
  locale: ContentLanguage;
  onViewJobs: (jobId?: string) => void;
  resumeSessionId?: string;
}

interface FormState {
  video: File | null;
  videoDurationSec: number | null;
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
  subtitleMode: SubtitleMode;
  tone: string;
  ctaText: string;
  referenceLink: string;
}

const initialForm: FormState = {
  video: null,
  videoDurationSec: null,
  title: "",
  description: "",
  contentType: "affiliate",
  socialPlatform: "instagram",
  subtitleMode: "without_subtitles",
  tone: "natural",
  ctaText: "",
  referenceLink: ""
};

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function audioFileSupported(file: File): boolean {
  const extension = file.name.toLowerCase().split(".").pop();
  return file.type.startsWith("audio/") || ["wav", "mp3", "m4a", "mp4", "ogg"].includes(extension || "");
}

export function GeneratePage({ locale, onViewJobs, resumeSessionId }: GeneratePageProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [session, setSession] = useState<GenerationSessionRecord | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | Blob | null>(null);
  const [voiceName, setVoiceName] = useState("");
  const [voiceDurationSec, setVoiceDurationSec] = useState<number | null>(null);
  const [finalVideo, setFinalVideo] = useState<Blob | null>(null);
  const [finalName, setFinalName] = useState("voiceover-final.mp4");
  const [busy, setBusy] = useState<"" | "video" | "analysis" | "audio" | "render">("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;
    void Promise.all([
      fetchGenerationSession(resumeSessionId),
      getCachedSessionAssets(resumeSessionId).catch(() => undefined)
    ]).then(([nextSession, cache]) => {
      if (cancelled) return;
      setSession(nextSession);
      if (cache?.audioBlob && cache.audioScriptText === nextSession.scriptText) {
        setVoiceFile(cache.audioBlob);
        setVoiceName("Voice tersimpan di perangkat");
        void readBlobDuration(cache.audioBlob, "audio").then(setVoiceDurationSec).catch(() => undefined);
      }
      if (cache?.renderedVideoBlob) {
        setFinalVideo(cache.renderedVideoBlob);
        setFinalName(cache.renderFileName || `${nextSession.title}-final.mp4`);
      }
      if (!cache?.sourceVideoBlob) {
        setNotice("Video sumber tidak tersedia di perangkat ini. Upload ulang video untuk melanjutkan.");
      }
    }).catch((loadError) => setError((loadError as Error).message));
    return () => { cancelled = true; };
  }, [resumeSessionId]);

  const selectVideo = async (file: File | null) => {
    setError("");
    setSession(null);
    setFinalVideo(null);
    if (!file) {
      setForm((current) => ({ ...current, video: null, videoDurationSec: null }));
      return;
    }
    setBusy("video");
    try {
      const duration = await readVideoDuration(file);
      if (duration > 60) throw new Error("Durasi video maksimal 60 detik.");
      setForm((current) => ({ ...current, video: file, videoDurationSec: duration }));
    } catch (readError) {
      setError((readError as Error).message);
    } finally {
      setBusy("");
    }
  };

  const analyze = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!form.video || !form.videoDurationSec || !form.title.trim() || !form.description.trim()) {
      setError("Video, judul, dan deskripsi wajib diisi.");
      return;
    }
    setBusy("analysis");
    setProgress(5);
    try {
      const frames = await extractFramesFromVideo(form.video, {
        durationSec: form.videoDurationSec,
        onProgress: (value) => setProgress(Math.max(5, Math.round(value * 0.35)))
      });
      setProgress(45);
      const result = await createGenerationSession({
        title: form.title.trim(),
        description: form.description.trim(),
        contentType: form.contentType,
        socialPlatform: form.socialPlatform,
        contentLanguage: locale,
        includeSubtitles: form.subtitleMode === "with_subtitles",
        tone: form.tone,
        ctaText: form.ctaText.trim() || undefined,
        referenceLink: form.referenceLink.trim() || undefined,
        videoDurationSec: form.videoDurationSec,
        frames: frames.map(({ timestampSec, mimeType, base64Data, width, height }) => ({
          timestampSec, mimeType, base64Data, width, height
        }))
      });
      setProgress(100);
      setSession(result.session);
      setVoiceFile(null);
      setVoiceName("");
      setVoiceDurationSec(null);
      await upsertCachedSessionAssets({
        sessionId: result.session.sessionId,
        sourceVideoName: form.video.name,
        sourceVideoType: form.video.type || "video/mp4",
        sourceVideoBlob: form.video,
        updatedAt: new Date().toISOString()
      });
      setNotice("Analisis selesai. Salin tiga field ke Google AI Studio, lalu upload hasil voice di bawah.");
    } catch (analysisError) {
      setError((analysisError as Error).message);
    } finally {
      setBusy("");
    }
  };

  const selectVoice = async (file: File | null) => {
    setError("");
    if (!file || !session) return;
    if (file.size > MAX_AUDIO_BYTES) {
      setError("Ukuran voice maksimal 25 MB.");
      return;
    }
    if (!audioFileSupported(file)) {
      setError("Format voice harus WAV, MP3, M4A, MP4 audio, atau OGG.");
      return;
    }
    setBusy("audio");
    try {
      const duration = await readBlobDuration(file, "audio");
      const cache = await getCachedSessionAssets(session.sessionId);
      if (!cache?.sourceVideoBlob) throw new Error("Video sumber lokal tidak ditemukan.");
      setVoiceFile(file);
      setVoiceName(file.name);
      setVoiceDurationSec(duration);
      await upsertCachedSessionAssets({
        ...cache,
        audioBlob: file,
        audioMimeType: file.type || "audio/wav",
        audioScriptText: session.scriptText,
        updatedAt: new Date().toISOString()
      });
    } catch (audioError) {
      setError((audioError as Error).message || "File voice tidak dapat dibaca.");
    } finally {
      setBusy("");
    }
  };

  const merge = async () => {
    if (!session || !voiceFile) return;
    setBusy("render");
    setError("");
    setProgress(0);
    try {
      const cache = await getCachedSessionAssets(session.sessionId);
      if (!cache?.sourceVideoBlob) throw new Error("Video sumber lokal tidak ditemukan. Upload ulang video.");
      const output = await renderFinalVideoLocally({
        sourceVideo: cache.sourceVideoBlob,
        sourceVideoName: cache.sourceVideoName,
        audioWavBlob: voiceFile,
        audioFileName: voiceFile instanceof File ? voiceFile.name : undefined,
        subtitleText: session.includeSubtitles ? session.scriptText : undefined,
        onProgress: (ratio) => setProgress(Math.round(ratio * 100))
      });
      const name = `${session.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "voiceover"}-final.mp4`;
      const completed = await completeGenerationSession(session.sessionId, {
        finalDurationSec: session.videoDurationSec,
        finalSizeBytes: output.size,
        localFileName: name
      });
      await upsertCachedSessionAssets({
        ...cache,
        audioBlob: voiceFile,
        audioMimeType: voiceFile.type || "audio/wav",
        audioScriptText: session.scriptText,
        renderedVideoBlob: output,
        renderFileName: name,
        updatedAt: new Date().toISOString()
      });
      setSession(completed);
      setFinalVideo(output);
      setFinalName(name);
      setNotice("Video final siap. Caption, hashtag, dan link sekarang dapat disalin.");
    } catch (renderError) {
      await failGenerationSession(session.sessionId, {
        reason: (renderError as Error).message,
        retryable: true
      }).catch(() => undefined);
      setError((renderError as Error).message);
    } finally {
      setBusy("");
    }
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} disalin.`);
  };

  const copyAll = async () => {
    if (!session) return;
    await copyText(
      `SCENE\n${session.sceneText}\n\nSAMPLE CONTEXT\n${session.sampleContextText}\n\nSCRIPT\n${session.scriptText}`,
      "Paket AI Studio"
    );
  };

  const completed = session?.status === "completed";

  return (
    <section className="personal-workspace">
      <header className="personal-workspace-head">
        <div>
          <span className="eyebrow">PERSONAL VIDEO WORKFLOW</span>
          <h1>Analisis, buat voice, lalu gabungkan.</h1>
          <p>AI hanya menyiapkan naskah. Voice dibuat sendiri di Google AI Studio dan diproses lokal.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => onViewJobs(session?.sessionId)}>
          <FolderClock size={17} /> Riwayat
        </button>
      </header>

      <form className="personal-step-card" onSubmit={analyze}>
        <div className="personal-step-number">01</div>
        <div className="personal-step-content">
          <h2>Upload dan analisa video</h2>
          <label className="personal-dropzone">
            <UploadCloud size={28} />
            <strong>{form.video?.name || "Pilih video MP4 atau MOV"}</strong>
            <span>{form.videoDurationSec ? formatVideoDuration(form.videoDurationSec) : "Maksimal 60 detik"}</span>
            <input type="file" accept="video/*" onChange={(event) => void selectVideo(event.target.files?.[0] || null)} />
          </label>
          <div className="personal-form-grid">
            <label>Judul<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>Kategori<select value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value as ContentType })}>{CONTENT_TYPES.map((value) => <option key={value} value={value}>{getContentLabel(locale, value)}</option>)}</select></label>
            <label className="span-2">Deskripsi<textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label>Platform<select value={form.socialPlatform} onChange={(e) => setForm({ ...form, socialPlatform: e.target.value as SocialPlatform })}>{PLATFORM_OPTIONS.map((value) => <option key={value} value={value}>{getPlatformLabel(locale, value)}</option>)}</select></label>
            <label>Tone<select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>{TONE_OPTIONS.map((value) => <option key={value} value={value}>{getToneLabel(locale, value)}</option>)}</select></label>
            <label>Subtitle<select value={form.subtitleMode} onChange={(e) => setForm({ ...form, subtitleMode: e.target.value as SubtitleMode })}>{SUBTITLE_MODE_OPTIONS.map((value) => <option key={value} value={value}>{getSubtitleModeLabel(locale, value)}</option>)}</select></label>
            <label>CTA opsional<input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} /></label>
            <label className="span-2">Link referensi opsional<input type="url" value={form.referenceLink} onChange={(e) => setForm({ ...form, referenceLink: e.target.value })} placeholder="https://..." /></label>
          </div>
          <button className="primary-action" disabled={Boolean(busy)}>
            {busy === "analysis" ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            {busy === "analysis" ? `Menganalisa ${progress}%` : "Analisa Video"}
          </button>
        </div>
      </form>

      {session ? (
        <section className="personal-step-card">
          <div className="personal-step-number">02</div>
          <div className="personal-step-content">
            <div className="personal-result-head">
              <div><h2>Paket Google AI Studio</h2><p>Salin setiap field ke form Generate Speech.</p></div>
              <div className="personal-actions">
                <button type="button" onClick={() => void copyAll()}><Clipboard size={16} /> Salin Semua</button>
                <a href={AI_STUDIO_URL} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Buka AI Studio</a>
              </div>
            </div>
            {([
              ["Scene", session.sceneText],
              ["Sample Context", session.sampleContextText],
              ["Naskah", session.scriptText]
            ] as const).map(([label, value]) => (
              <article className="copy-result-card" key={label}>
                <header><strong>{label}</strong><button type="button" onClick={() => void copyText(value, label)}><Clipboard size={15} /> Salin</button></header>
                <p>{value}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {session ? (
        <section className="personal-step-card">
          <div className="personal-step-number">03</div>
          <div className="personal-step-content">
            <h2>Upload voice dan gabungkan</h2>
            <label className="personal-dropzone audio-dropzone">
              <FileAudio size={28} />
              <strong>{voiceName || "Upload hasil voice dari AI Studio"}</strong>
              <span>{voiceDurationSec ? `${voiceDurationSec.toFixed(2)} detik voice / ${session.videoDurationSec.toFixed(2)} detik video` : "WAV, MP3, M4A, MP4 audio, atau OGG. Maksimal 25 MB."}</span>
              <input type="file" accept={AUDIO_ACCEPT} onChange={(event) => void selectVoice(event.target.files?.[0] || null)} />
            </label>
            <button type="button" className="primary-action" disabled={!voiceFile || Boolean(busy)} onClick={() => void merge()}>
              {busy === "render" ? <LoaderCircle className="spin" size={18} /> : <Video size={18} />}
              {busy === "render" ? `Menggabungkan ${progress}%` : "Gabungkan Voice dengan Video"}
            </button>
          </div>
        </section>
      ) : null}

      {completed && finalVideo && session ? (
        <section className="personal-step-card completed-card">
          <div className="personal-step-number"><CheckCircle2 size={20} /></div>
          <div className="personal-step-content">
            <h2>Video siap digunakan</h2>
            <button type="button" className="primary-action" onClick={() => downloadBlob(finalVideo, finalName)}><Download size={18} /> Download MP4</button>
            <article className="copy-result-card"><header><strong>Caption</strong><button type="button" onClick={() => void copyText(session.captionText, "Caption")}><Clipboard size={15} /> Salin</button></header><p>{session.captionText}</p></article>
            <article className="copy-result-card"><header><strong>Hashtag</strong><button type="button" onClick={() => void copyText(session.hashtags.join(" "), "Hashtag")}><Clipboard size={15} /> Salin</button></header><p>{session.hashtags.join(" ")}</p></article>
            {session.referenceLink ? <article className="copy-result-card"><header><strong>Link</strong><button type="button" onClick={() => void copyText(session.referenceLink || "", "Link")}><Link2 size={15} /> Salin</button></header><p>{session.referenceLink}</p></article> : null}
          </div>
        </section>
      ) : null}

      {notice ? <p className="success-text">{notice}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
