import { useEffect, useState, type FormEvent } from "react";
import { Clipboard, ExternalLink, FolderClock, Link2, LoaderCircle, Sparkles, UploadCloud } from "lucide-react";
import { createGenerationSession, fetchGenerationSession, fetchSession } from "../api";
import { extractFramesFromVideo } from "../frame-extractor";
import {
  getContentLabel, getPlatformLabel, getToneLabel, PLATFORM_OPTIONS, TONE_OPTIONS
} from "../job-form-options";
import type { AuthUser, ContentLanguage, ContentType, GenerationSessionRecord, SocialPlatform } from "../types";
import { CONTENT_TYPES } from "../types";
import { readVideoDuration } from "../video-duration";
import { formatVideoDuration } from "../utils/billing";

const AI_STUDIO_URL = "https://aistudio.google.com/generate-speech";

interface GeneratePageProps {
  locale: ContentLanguage;
  user: AuthUser;
  onViewJobs: (jobId?: string) => void;
  onSubscribe: () => void;
  onUserUpdated: (user: AuthUser) => void;
  resumeSessionId?: string;
}

interface FormState {
  video: File | null;
  videoDurationSec: number | null;
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
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
  tone: "natural",
  ctaText: "",
  referenceLink: ""
};

function rupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function GeneratePage({ locale, user, onViewJobs, onSubscribe, onUserUpdated, resumeSessionId }: GeneratePageProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [session, setSession] = useState<GenerationSessionRecord | null>(null);
  const [busy, setBusy] = useState<"" | "video" | "analysis">("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;
    void fetchGenerationSession(resumeSessionId)
      .then((nextSession) => { if (!cancelled) setSession(nextSession); })
      .catch((loadError) => { if (!cancelled) setError((loadError as Error).message); });
    return () => { cancelled = true; };
  }, [resumeSessionId]);

  const selectVideo = async (file: File | null) => {
    setError("");
    setSession(null);
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
      const nextUser = await fetchSession();
      if (nextUser) onUserUpdated(nextUser);
      setNotice("Analisis selesai. Semua teks siap disalin dan digunakan.");
    } catch (analysisError) {
      setError((analysisError as Error).message);
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
      `SCENE\n${session.sceneText}\n\nSAMPLE CONTEXT\n${session.sampleContextText}\n\nSCRIPT\n${session.scriptText}\n\nCAPTION\n${session.captionText}\n\nHASHTAG\n${session.hashtags.join(" ")}`,
      "Semua hasil analisis"
    );
  };

  return (
    <section className="personal-workspace">
      <header className="personal-workspace-head">
        <div>
          <span className="eyebrow">PERSONAL VIDEO WORKFLOW</span>
          <h1>Analisis video dan siapkan naskah.</h1>
          <p>AI menganalisis visual lalu menyiapkan naskah, arahan suara, caption, dan hashtag.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => onViewJobs(session?.sessionId)}>
          <FolderClock size={17} /> Riwayat
        </button>
      </header>

      <form className="personal-step-card" onSubmit={analyze}>
        <div className="personal-step-number">01</div>
        <div className="personal-step-content">
          <h2>Upload dan analisa video</h2>
          <div className={user.hasAnalysisAccess ? "analysis-access-note" : "analysis-access-note exhausted"}>
            {user.subscriptionStatus === "active" || user.isUnlimited
              ? "Akses premium aktif · model mengikuti pengaturan admin."
              : user.hasAnalysisAccess
                ? user.freeAnalysisRemaining > 0
                  ? `Gratis tersisa ${user.freeAnalysisRemaining} dari ${user.freeAnalysisLimit} analisis.`
                  : `Saldo aktif ${rupiah(user.walletBalanceIdr)} · siap untuk ${user.generateCreditsRemaining ?? 0} analisis lagi.`
                : "10 analisis gratis sudah habis. Top up credit untuk melanjutkan."}
            {!user.hasAnalysisAccess ? <button type="button" onClick={onSubscribe}>Top Up</button> : null}
          </div>
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
            <label>CTA opsional<input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} /></label>
            <label className="span-2">Link referensi opsional<input type="url" value={form.referenceLink} onChange={(e) => setForm({ ...form, referenceLink: e.target.value })} placeholder="https://..." /></label>
          </div>
          <button className="primary-action" disabled={Boolean(busy) || !user.hasAnalysisAccess}>
            {busy === "analysis" ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            {busy === "analysis" ? `Menganalisa ${progress}%` : "Analisa Video"}
          </button>
        </div>
      </form>

      {session ? (
        <section className="personal-step-card completed-card">
          <div className="personal-step-number">02</div>
          <div className="personal-step-content">
            <div className="personal-result-head">
              <div><h2>Hasil analisis</h2><p>Naskah, arahan suara, caption, dan hashtag langsung siap digunakan.</p></div>
              <div className="personal-actions">
                <button type="button" onClick={() => void copyAll()}><Clipboard size={16} /> Salin Semua</button>
                <a href={AI_STUDIO_URL} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Buka AI Studio</a>
              </div>
            </div>
            {([[
              "Scene", session.sceneText
            ], [
              "Sample Context", session.sampleContextText
            ], [
              "Naskah", session.scriptText
            ], [
              "Caption", session.captionText
            ], [
              "Hashtag", session.hashtags.join(" ")
            ]] as const).map(([label, value]) => (
              <article className="copy-result-card" key={label}>
                <header><strong>{label}</strong><button type="button" onClick={() => void copyText(value, label)}><Clipboard size={15} /> Salin</button></header>
                <p>{value}</p>
              </article>
            ))}
            {session.referenceLink ? (
              <article className="copy-result-card">
                <header><strong>Link</strong><button type="button" onClick={() => void copyText(session.referenceLink || "", "Link")}><Link2 size={15} /> Salin</button></header>
                <p>{session.referenceLink}</p>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {notice ? <p className="success-text">{notice}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
