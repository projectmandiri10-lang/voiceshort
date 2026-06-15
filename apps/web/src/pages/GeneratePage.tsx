import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleDollarSign,
  Download,
  FolderClock,
  Gauge,
  Globe,
  History,
  Layers3,
  Link2,
  Mic2,
  PenSquare,
  Radio,
  Sparkles,
  UploadCloud,
  Video
} from "lucide-react";
import {
  ApiError,
  completeGenerationSession,
  createGenerationSession,
  failGenerationSession,
  fetchGenerationSession,
  fetchGenerationSessionAudio
} from "../api";
import { extractFramesFromVideo } from "../frame-extractor";
import { getCachedSessionAssets, upsertCachedSessionAssets } from "../generation-cache";
import {
  CONTENT_LABEL,
  GENDER_LABEL,
  PLATFORM_LABEL,
  PLATFORM_OPTIONS,
  TONE_OPTIONS
} from "../job-form-options";
import { renderFinalVideoLocally } from "../local-render";
import { listCachedSessionIds } from "../generation-cache";
import type {
  AuthUser,
  ContentType,
  GenerationSessionRecord,
  JobVoiceGender,
  SocialPlatform
} from "../types";
import { CONTENT_TYPES } from "../types";
import { readVideoDuration } from "../video-duration";
import { calculateEstimatedChargeIdr, formatVideoDuration } from "../utils/billing";

const DEFAULT_CONTENT_TYPE: ContentType = "affiliate";
const DEFAULT_SOCIAL_PLATFORM: SocialPlatform = "instagram";
const DEFAULT_VOICE_GENDER: JobVoiceGender = "female";
const DEFAULT_TONE = "natural";

interface GeneratePageProps {
  currentUser: AuthUser;
  onRefreshSession: () => Promise<void>;
  onViewJobs: (jobId?: string) => void;
  resumeSessionId?: string;
}

interface GenerateFormState {
  video: File | null;
  videoDurationSec: number | null;
  durationPending: boolean;
  durationError: string;
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText: string;
  referenceLink: string;
  fileInputKey: number;
}

interface FlowState {
  phase:
    | "idle"
    | "extracting"
    | "generating"
    | "synthesizing"
    | "rendering"
    | "completed";
  label: string;
  percent: number;
}

function formatRupiah(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function createInitialFormState(): GenerateFormState {
  return {
    video: null,
    videoDurationSec: null,
    durationPending: false,
    durationError: "",
    title: "",
    description: "",
    contentType: DEFAULT_CONTENT_TYPE,
    socialPlatform: DEFAULT_SOCIAL_PLATFORM,
    voiceGender: DEFAULT_VOICE_GENDER,
    tone: DEFAULT_TONE,
    ctaText: "",
    referenceLink: "",
    fileInputKey: 0
  };
}

function createIdleFlowState(): FlowState {
  return {
    phase: "idle",
    label: "Siap mulai generate",
    percent: 0
  };
}

function isFormReady(form: GenerateFormState): boolean {
  return Boolean(
    form.video &&
      form.videoDurationSec &&
      !form.durationPending &&
      !form.durationError &&
      form.title.trim() &&
      form.description.trim() &&
      form.socialPlatform.trim() &&
      form.tone.trim()
  );
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

export function GeneratePage({
  currentUser,
  onRefreshSession,
  onViewJobs,
  resumeSessionId
}: GeneratePageProps) {
  const [form, setForm] = useState<GenerateFormState>(() => createInitialFormState());
  const [flowState, setFlowState] = useState<FlowState>(() => createIdleFlowState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSession, setActiveSession] = useState<GenerationSessionRecord | null>(null);
  const [finalVideoBlob, setFinalVideoBlob] = useState<Blob | null>(null);
  const [finalVideoName, setFinalVideoName] = useState("voiceover-shorts-final.mp4");
  const [cachedSessionIds, setCachedSessionIds] = useState<string[]>([]);
  const [resumeHint, setResumeHint] = useState("");

  const estimatedChargeIdr = useMemo(
    () => calculateEstimatedChargeIdr(currentUser.generatePriceIdr),
    [currentUser.generatePriceIdr]
  );
  const hasEnoughBalance =
    currentUser.isUnlimited || currentUser.walletBalanceIdr >= currentUser.generatePriceIdr;
  const projectedBalanceIdr = currentUser.isUnlimited
    ? null
    : Math.max(0, currentUser.walletBalanceIdr - estimatedChargeIdr);
  const formDisabled = loading || !hasEnoughBalance;
  const currentCacheReady = activeSession ? cachedSessionIds.includes(activeSession.sessionId) : false;

  useEffect(() => {
    void listCachedSessionIds()
      .then(setCachedSessionIds)
      .catch(() => setCachedSessionIds([]));
  }, [activeSession?.sessionId]);

  useEffect(() => {
    if (!resumeSessionId) {
      return;
    }

    let cancelled = false;
    void fetchGenerationSession(resumeSessionId)
      .then(async (session) => {
        if (cancelled) {
          return;
        }
        setActiveSession(session);
        const cache = await getCachedSessionAssets(session.sessionId).catch(() => undefined);
        if (cancelled) {
          return;
        }
        if (cache?.renderedVideoBlob) {
          setFinalVideoBlob(cache.renderedVideoBlob);
          setFinalVideoName(cache.renderFileName || `${session.title || "voiceover"}.mp4`);
          setResumeHint("Draft final untuk session ini ditemukan. Anda bisa unduh ulang atau buat ulang.");
          return;
        }
        if (cache?.sourceVideoBlob) {
          setResumeHint("Draft lokal untuk session ini ditemukan. Anda bisa melanjutkan finalisasi tanpa generate ulang.");
          return;
        }
        setResumeHint("Session AI tersimpan, tetapi media lokal belum ada di perangkat ini.");
      })
      .catch(() => {
        if (!cancelled) {
          setResumeHint("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resumeSessionId]);

  const updateForm = (updater: (current: GenerateFormState) => GenerateFormState) => {
    setForm((current) => updater(current));
  };

  const onVideoSelected = (file: File | null) => {
    setFinalVideoBlob(null);
    setResumeHint("");
    updateForm((current) => ({
      ...current,
      video: file,
      videoDurationSec: null,
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
          if (durationSec > 60) {
            return {
              ...current,
              durationPending: false,
              videoDurationSec: durationSec,
              durationError: "Durasi video melebihi batas 60 detik. Pilih video yang lebih singkat."
            };
          }
          return {
            ...current,
            videoDurationSec: durationSec,
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

  const runLocalRender = async (
    session: GenerationSessionRecord,
    sourceVideoBlob: Blob,
    sourceVideoName: string,
    audioBlob: Blob
  ) => {
    setFlowState({
      phase: "rendering",
      label: "Menyusun file final",
      percent: 72
    });
    const renderedVideoBlob = await renderFinalVideoLocally({
      sourceVideo: sourceVideoBlob,
      audioWavBlob: audioBlob,
      sourceVideoName,
      onProgress: (ratio) => {
        setFlowState({
          phase: "rendering",
          label: "Menyusun file final",
          percent: 72 + Math.round(ratio * 28)
        });
      }
    });
    const nextFileName = `${session.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "voiceover"}-final.mp4`;
    await upsertCachedSessionAssets({
      sessionId: session.sessionId,
      sourceVideoBlob,
      sourceVideoName,
      sourceVideoType: sourceVideoBlob.type || "video/mp4",
      audioBlob,
      audioMimeType: audioBlob.type || "audio/wav",
      renderedVideoBlob,
      renderFileName: nextFileName,
      updatedAt: new Date().toISOString()
    });
    const completedSession = await completeGenerationSession(session.sessionId, {
      finalDurationSec: session.videoDurationSec,
      finalSizeBytes: renderedVideoBlob.size,
      localFileName: nextFileName
    });
    setActiveSession(completedSession);
    setFinalVideoBlob(renderedVideoBlob);
    setFinalVideoName(nextFileName);
    setFlowState({
      phase: "completed",
      label: "Final video siap diunduh",
      percent: 100
    });
    try {
      await onRefreshSession();
    } catch {
      // keep success state even if balance refresh is late
    }
  };

  const continueRenderFromCache = async (session: GenerationSessionRecord) => {
    const cache = await getCachedSessionAssets(session.sessionId);
    if (!cache?.sourceVideoBlob) {
      throw new Error("Draft video lokal untuk session ini tidak ditemukan di perangkat ini.");
    }

    let audioBlob = cache.audioBlob;
    if (!audioBlob) {
      setFlowState({
        phase: "synthesizing",
        label: "Mengambil ulang audio utama",
        percent: 54
      });
      audioBlob = await fetchGenerationSessionAudio(session.sessionId);
      await upsertCachedSessionAssets({
        ...cache,
        audioBlob,
        audioMimeType: audioBlob.type || "audio/wav",
        updatedAt: new Date().toISOString()
      });
    }

    await runLocalRender(session, cache.sourceVideoBlob, cache.sourceVideoName, audioBlob);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!hasEnoughBalance) {
      setError("Saldo belum cukup. Isi saldo dulu sebelum mulai generate.");
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
    if (!form.videoDurationSec || form.videoDurationSec > 60) {
      setError("Durasi video belum valid. Maksimum 60 detik.");
      return;
    }
    if (!isFormReady(form)) {
      setError(
        "Form belum lengkap. Pastikan video, judul, brief, kategori, platform, gender, dan tone sudah siap."
      );
      return;
    }

    setLoading(true);
    setFinalVideoBlob(null);
    setFlowState({
      phase: "extracting",
      label: "Menganalisis video",
      percent: 8
    });

    let createdSession: GenerationSessionRecord | null = null;
    try {
      const frames = await extractFramesFromVideo(form.video, {
        durationSec: form.videoDurationSec,
        onProgress: (progress) => {
          setFlowState({
            phase: "extracting",
            label: `Menganalisis video (${progress}%)`,
            percent: Math.max(8, Math.round(progress * 0.22))
          });
        }
      });

      setFlowState({
        phase: "generating",
        label: "Menyusun naskah, caption, dan rencana suara",
        percent: 34
      });

      const generated = await createGenerationSession({
        title: form.title.trim(),
        description: form.description.trim(),
        contentType: form.contentType,
        socialPlatform: form.socialPlatform,
        voiceGender: form.voiceGender,
        tone: form.tone.trim(),
        ctaText: form.ctaText.trim() || undefined,
        referenceLink: form.referenceLink.trim() || undefined,
        videoDurationSec: form.videoDurationSec,
        frames: frames.map((frame) => ({
          timestampSec: frame.timestampSec,
          mimeType: frame.mimeType,
          base64Data: frame.base64Data,
          width: frame.width,
          height: frame.height
        }))
      });
      const session = generated.session;
      createdSession = session;
      setActiveSession(session);

      await upsertCachedSessionAssets({
        sessionId: session.sessionId,
        sourceVideoBlob: form.video,
        sourceVideoName: form.video.name,
        sourceVideoType: form.video.type || "video/mp4",
        updatedAt: new Date().toISOString()
      });
      setCachedSessionIds((current) =>
        current.includes(session.sessionId)
          ? current
          : [session.sessionId, ...current]
      );

      setFlowState({
        phase: "synthesizing",
        label: "Mengambil audio utama",
        percent: 54
      });
      const audioBlob = await fetchGenerationSessionAudio(session.sessionId);
      await upsertCachedSessionAssets({
        sessionId: session.sessionId,
        sourceVideoBlob: form.video,
        sourceVideoName: form.video.name,
        sourceVideoType: form.video.type || "video/mp4",
        audioBlob,
        audioMimeType: audioBlob.type || "audio/wav",
        updatedAt: new Date().toISOString()
      });

      await runLocalRender(session, form.video, form.video.name, audioBlob);

      setForm((current) => ({
        ...createInitialFormState(),
        fileInputKey: current.fileInputKey + 1
      }));
    } catch (submitError) {
      if (createdSession) {
        await failGenerationSession(createdSession.sessionId, {
          reason: (submitError as Error).message,
          retryable: true
        }).catch(() => undefined);
      }
      if (submitError instanceof ApiError && submitError.status === 402) {
        setError(submitError.message || "Saldo belum cukup untuk generate.");
      } else {
        setError((submitError as Error).message);
      }
      setFlowState(createIdleFlowState());
    } finally {
      setLoading(false);
    }
  };

  const onResumeRender = async () => {
    if (!activeSession) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await continueRenderFromCache(activeSession);
    } catch (resumeError) {
      await failGenerationSession(activeSession.sessionId, {
        reason: (resumeError as Error).message,
        retryable: true
      }).catch(() => undefined);
      setError((resumeError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const telemetryStatusLabel = flowState.phase === "completed"
    ? "Final siap"
    : loading
      ? "Sedang diproses"
      : !hasEnoughBalance
        ? "Saldo belum cukup"
        : isFormReady(form)
          ? "Siap proses"
          : "Lengkapi form";
  const telemetryStatusDescription = flowState.phase === "completed"
    ? "Naskah, audio, dan final video sudah selesai dirakit."
    : loading
      ? flowState.label
      : !hasEnoughBalance
        ? "Top up saldo dulu untuk memulai generate berikutnya."
        : "Video lokal akan dianalisis otomatis lalu hasil final dirakit tanpa detail teknis yang ditampilkan.";

  return (
    <section className="generate-concise-shell">
      <div className="generate-editor-column">
        <div className="generate-hero">
          <div className="generate-hero-tags">
            <span className="eyebrow">Proses Lokal</span>
            <span className="generate-hero-chip">Proses Otomatis</span>
          </div>
          <h2>Buat voice over dan final.mp4 langsung dari perangkat Anda</h2>
          <p>
            Video tetap lokal di perangkat Anda. Sistem menganalisis cuplikan visual, menyusun naskah dan
            audio, lalu merakit MP4 final secara otomatis.
          </p>
        </div>

        <div className="generate-editor-stack">
          {resumeHint ? (
            <section className="workspace-inline-card">
              <div className="workspace-inline-card-head">
                <strong>Session tersambung</strong>
                <span className="small">Lanjut lokal</span>
              </div>
              <p className="section-note">{resumeHint}</p>
              <div className="form-actions">
                <button type="button" onClick={() => onViewJobs(activeSession?.sessionId)}>
                  <FolderClock size={16} />
                  <span>Buka Riwayat Session</span>
                </button>
                {currentCacheReady && activeSession && activeSession.status !== "completed" ? (
                  <button type="button" onClick={() => void onResumeRender()} disabled={loading}>
                    <Video size={16} />
                    <span>{loading ? "Melanjutkan..." : "Lanjutkan Finalisasi"}</span>
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <form onSubmit={onSubmit} className="generate-workspace-form">
            <section className="generate-upload-card" role="region" aria-label="slot video 1">
              <div className="generate-section-head">
                <div>
                  <span className="generate-section-label">Upload Video</span>
                  <h3>Video Utama</h3>
                  <p className="small">Video tetap di perangkat Anda. Hanya cuplikan visual yang dipakai untuk analisis.</p>
                </div>
                <span
                  className={
                    isFormReady(form)
                      ? "batch-slot-status batch-slot-status-ready"
                      : "batch-slot-status batch-slot-status-empty"
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
                      <p>Maksimal 60 detik. Video akan dianalisis otomatis untuk mengambil cuplikan penting.</p>
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
                  <Gauge size={15} strokeWidth={2} />
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
                      {currentUser.isUnlimited ? "Unlimited" : formatRupiah(estimatedChargeIdr)}
                    </strong>
                  </div>
                </div>
                <div className="generate-meta-divider" aria-hidden="true" />
                <div className="generate-meta-item">
                  <Mic2 size={15} strokeWidth={2} />
                  <div>
                    <span className="generate-meta-label">Mode</span>
                    <strong className="generate-meta-value">Flat per proses</strong>
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
                    Sistem akan menghasilkan naskah, caption, hashtag, dan rencana suara dari data ini.
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
                          title: event.target.value
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
                        description: event.target.value
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
                      <span className="generate-input-icon" aria-hidden="true">
                        <Layers3 size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>

                  <label className="generate-field">
                    <span className="generate-field-label">
                      Platform Medsos <span className="required-mark">*</span>
                    </span>
                    <div className="generate-input-wrap">
                      <select
                        value={form.socialPlatform}
                        onChange={(event) =>
                          updateForm((current) => ({
                            ...current,
                            socialPlatform: event.target.value as SocialPlatform
                          }))
                        }
                        disabled={formDisabled}
                      >
                        {PLATFORM_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {PLATFORM_LABEL[item]}
                          </option>
                        ))}
                      </select>
                      <span className="generate-input-icon" aria-hidden="true">
                        <Globe size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>
                </div>

                <div className="generate-field-row">
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
                      <span className="generate-input-icon" aria-hidden="true">
                        <Radio size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>

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
                      <span className="generate-input-icon" aria-hidden="true">
                        <Sparkles size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>
                </div>

                <div className="generate-field-row">
                  <label className="generate-field">
                    <span className="generate-field-label">CTA Opsional</span>
                    <div className="generate-input-wrap">
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
                      <span className="generate-input-icon" aria-hidden="true">
                        <Link2 size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>

                  <label className="generate-field">
                    <span className="generate-field-label">Link Referensi Opsional</span>
                    <div className="generate-input-wrap">
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
                      <span className="generate-input-icon" aria-hidden="true">
                        <Globe size={16} strokeWidth={2} />
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </section>

            {error ? <p className="err-text">{error}</p> : null}

            <div className="generate-floating-dock">
              <button
                type="button"
                className="generate-history-button"
                onClick={() => onViewJobs(activeSession?.sessionId)}
              >
                <History size={17} strokeWidth={2} />
                <span>Riwayat Session</span>
              </button>

              <div className="generate-dock-divider" aria-hidden="true" />

              <div className="generate-dock-summary">
                <span className="generate-dock-label">Biaya Generate</span>
                <strong>
                  {currentUser.isUnlimited ? "Unlimited" : formatRupiah(estimatedChargeIdr)}
                </strong>
                <p className="small">
                  {currentUser.isUnlimited
                    ? "Akun ini tidak dipotong saldo."
                    : "Satu generate memotong satu biaya flat."}
                </p>
              </div>

              <button type="submit" className="generate-submit-button" disabled={formDisabled}>
                <Sparkles size={17} strokeWidth={2} />
                <span>{loading ? flowState.label : "Generate + Buat Final"}</span>
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
              <span className="generate-section-label">Status Workflow</span>
              <h4>
                {flowState.percent}
                <span>%</span>
              </h4>
            </div>
            <span
              className={
                flowState.phase === "completed"
                  ? "status status-success"
                  : loading
                    ? "status status-running"
                    : "status status-queued"
              }
            >
              {flowState.phase === "completed" ? "Selesai" : loading ? "Memproses" : "Menunggu"}
            </span>
          </div>

          <div className="generate-progress-stack">
            <div className="generate-progress-head">
              <span>Langkah aktif</span>
              <strong>{flowState.label}</strong>
            </div>
            <div className="generate-progress-track">
              <div className="generate-progress-value" style={{ width: `${flowState.percent}%` }} />
            </div>
          </div>

          <div className="generate-compute-metrics">
            <div className="generate-compute-metric">
              <Gauge size={15} strokeWidth={2} />
              <span>Cuplikan visual</span>
              <strong>Otomatis</strong>
            </div>
            <div className="generate-compute-metric">
              <Video size={15} strokeWidth={2} />
              <span>Finalisasi</span>
              <strong>Siap</strong>
            </div>
          </div>
        </section>

        <section className="generate-side-card">
          <span className="generate-section-label">Biaya & Saldo</span>
          <div className="generate-stat-list">
            <div className="generate-stat-row">
              <span>Biaya session ini</span>
              <strong>
                {currentUser.isUnlimited ? "Unlimited" : formatRupiah(estimatedChargeIdr)}
              </strong>
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
              <span>Status saldo</span>
              <strong>{hasEnoughBalance ? "Siap diproses" : "Perlu isi saldo"}</strong>
            </div>
            <p className="small">
              {currentUser.isUnlimited
                ? "Akun ini dapat generate tanpa pengurangan saldo."
                : `Harga flat per generate: ${formatRupiah(currentUser.generatePriceIdr)}.`}
            </p>
          </div>
        </section>

        {activeSession ? (
          <section className="generate-side-card">
            <span className="generate-section-label">Session AI</span>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon">
                <Sparkles size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">Status</p>
                <strong>{activeSession.status}</strong>
              </div>
            </div>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon generate-pipeline-icon-magenta">
                <Mic2 size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">Voice</p>
                <strong>{activeSession.voiceName || "Default"}</strong>
              </div>
            </div>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon">
                <Layers3 size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">Cuplikan visual dianalisis</p>
                <strong>{activeSession.frameCount} cuplikan</strong>
              </div>
            </div>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon">
                <Globe size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">Platform target</p>
                <strong>{PLATFORM_LABEL[activeSession.socialPlatform]}</strong>
              </div>
            </div>
            {activeSession.scriptText ? (
              <p className="small break-anywhere">{activeSession.scriptText}</p>
            ) : null}
            {activeSession.captionText ? (
              <p className="small break-anywhere">
                Caption: {activeSession.captionText}
                {activeSession.hashtags.length ? ` ${activeSession.hashtags.join(" ")}` : ""}
              </p>
            ) : null}
          </section>
        ) : null}

        {finalVideoBlob ? (
          <section className="generate-side-card generate-environment-card">
            <div className="generate-environment-icon">
              <CheckCircle2 size={22} strokeWidth={2} />
            </div>
            <div>
              <h4>Final video siap</h4>
              <p>
                File MP4 sudah dirakit di perangkat ini. Ukuran saat ini{" "}
                <strong>{(finalVideoBlob.size / (1024 * 1024)).toFixed(2)} MB</strong>.
              </p>
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => downloadBlob(finalVideoBlob, finalVideoName)}>
                <Download size={16} />
                <span>Unduh Final MP4</span>
              </button>
              <button type="button" onClick={() => onViewJobs(activeSession?.sessionId)}>
                <FolderClock size={16} />
                <span>Buka Riwayat</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="generate-side-card generate-environment-card">
            <div className="generate-environment-icon">
              <Sparkles size={22} strokeWidth={2} />
            </div>
            <div>
              <h4>{telemetryStatusLabel}</h4>
              <p>{telemetryStatusDescription}</p>
            </div>
          </section>
        )}
      </aside>
    </section>
  );
}
