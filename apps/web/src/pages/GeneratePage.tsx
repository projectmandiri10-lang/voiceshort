import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleDollarSign,
  Download,
  FolderClock,
  Gauge,
  Globe,
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
  getContentLabel,
  getGenderLabel,
  getPlatformLabel,
  getScriptModeLabel,
  getToneLabel,
  PLATFORM_OPTIONS,
  SCRIPT_MODE_OPTIONS,
  TONE_OPTIONS
} from "../job-form-options";
import { renderFinalVideoLocally } from "../local-render";
import { listCachedSessionIds } from "../generation-cache";
import type {
  AuthUser,
  ContentLanguage,
  ContentType,
  GenerationSessionRecord,
  JobVoiceGender,
  ScriptMode,
  SocialPlatform
} from "../types";
import { CONTENT_TYPES } from "../types";
import { formatIdrCurrency } from "../user-locale";
import { getUserCopy } from "../user-copy";
import { readVideoDuration } from "../video-duration";
import { calculateEstimatedChargeIdr, formatVideoDuration } from "../utils/billing";

const DEFAULT_CONTENT_TYPE: ContentType = "affiliate";
const DEFAULT_SOCIAL_PLATFORM: SocialPlatform = "instagram";
const DEFAULT_VOICE_GENDER: JobVoiceGender = "female";
const DEFAULT_SCRIPT_MODE: ScriptMode = "auto_analysis";
const DEFAULT_TONE = "natural";

interface GeneratePageProps {
  locale: ContentLanguage;
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
  scriptMode: ScriptMode;
  manualScriptText: string;
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
    scriptMode: DEFAULT_SCRIPT_MODE,
    manualScriptText: "",
    voiceGender: DEFAULT_VOICE_GENDER,
    tone: DEFAULT_TONE,
    ctaText: "",
    referenceLink: "",
    fileInputKey: 0
  };
}

function createIdleFlowState(label: string): FlowState {
  return {
    phase: "idle",
    label,
    percent: 0
  };
}

function isFormReady(form: GenerateFormState): boolean {
  const usesManualScript = form.scriptMode === "manual_script";
  return Boolean(
    form.video &&
      form.videoDurationSec &&
      !form.durationPending &&
      !form.durationError &&
      form.title.trim() &&
      form.socialPlatform.trim() &&
      (usesManualScript ? form.manualScriptText.trim() : form.description.trim()) &&
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
  locale,
  currentUser,
  onRefreshSession,
  onViewJobs,
  resumeSessionId
}: GeneratePageProps) {
  const copy = getUserCopy(locale);
  const [form, setForm] = useState<GenerateFormState>(() => createInitialFormState());
  const [flowState, setFlowState] = useState<FlowState>(() => createIdleFlowState(copy.generate.idleLabel));
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
  const usesManualScript = form.scriptMode === "manual_script";

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
          setResumeHint(copy.generate.localDraftFound);
          return;
        }
        if (cache?.sourceVideoBlob) {
          setResumeHint(copy.generate.localDraftMissing);
          return;
        }
        setResumeHint(copy.generate.localSessionOnly);
      })
      .catch(() => {
        if (!cancelled) {
          setResumeHint("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [copy.generate.localDraftFound, copy.generate.localDraftMissing, copy.generate.localSessionOnly, resumeSessionId]);

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
              durationError: copy.generate.durationTooLong
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
              (durationErrorValue as Error).message || copy.generate.durationUnreadable
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
      label: copy.generate.rendering,
      percent: 72
    });
    const renderedVideoBlob = await renderFinalVideoLocally({
      sourceVideo: sourceVideoBlob,
      audioWavBlob: audioBlob,
      sourceVideoName,
      onProgress: (ratio) => {
        setFlowState({
          phase: "rendering",
          label: copy.generate.renderingProgress,
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
      label: copy.generate.finalReadyTitle,
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
        label: copy.generate.fetchingAudio,
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
      setError(copy.generate.validateTopup);
      return;
    }
    if (!form.video) {
      setError(copy.generate.validateFile);
      return;
    }
    if (form.durationPending) {
      setError(copy.generate.validateDurationPending);
      return;
    }
    if (form.durationError) {
      setError(form.durationError);
      return;
    }
    if (!form.videoDurationSec || form.videoDurationSec > 60) {
      setError(copy.generate.validateDurationInvalid);
      return;
    }
    if (!isFormReady(form)) {
      setError(
        usesManualScript
          ? copy.generate.validateFormManual
          : copy.generate.validateFormAuto
      );
      return;
    }

    setLoading(true);
    setFinalVideoBlob(null);
    setFlowState(
      usesManualScript
        ? {
            phase: "generating",
            label: copy.generate.preparingManual,
            percent: 18
          }
        : {
            phase: "extracting",
            label: copy.generate.analyzingVideo,
            percent: 8
          }
    );

    let createdSession: GenerationSessionRecord | null = null;
    try {
      const frames = usesManualScript
        ? []
        : await extractFramesFromVideo(form.video, {
            durationSec: form.videoDurationSec,
            onProgress: (progress) => {
              setFlowState({
                phase: "extracting",
                label: `${copy.generate.analyzingVideo} (${progress}%)`,
                percent: Math.max(8, Math.round(progress * 0.22))
              });
            }
          });

      setFlowState({
        phase: "generating",
        label: usesManualScript
          ? copy.generate.generatingManual
          : copy.generate.generatingAuto,
        percent: usesManualScript ? 34 : 34
      });

      const generated = await createGenerationSession({
        title: form.title.trim(),
        description: form.description.trim(),
        contentType: form.contentType,
        socialPlatform: form.socialPlatform,
        contentLanguage: locale,
        scriptMode: form.scriptMode,
        manualScriptText: usesManualScript ? form.manualScriptText.trim() : undefined,
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
        label: copy.generate.fetchingAudio,
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
        setError(submitError.message || copy.generate.validateTopup);
      } else {
        setError((submitError as Error).message);
      }
      setFlowState(createIdleFlowState(copy.generate.idleLabel));
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
    ? copy.generate.flowCompleted
    : loading
      ? copy.generate.flowProcessing
      : !hasEnoughBalance
        ? copy.generate.insufficientBalance
        : isFormReady(form)
          ? copy.generate.readyProcess
          : copy.generate.completeForm;
  const telemetryStatusDescription = flowState.phase === "completed"
    ? copy.generate.finalReadyTitle
    : loading
      ? flowState.label
      : !hasEnoughBalance
        ? copy.generate.validateTopup
        : copy.generate.flowIdleLead;

  return (
    <section className="generate-concise-shell">
      <div className="generate-editor-column">
        <div className="generate-editor-stack">
          {resumeHint ? (
            <section className="workspace-inline-card">
              <div className="workspace-inline-card-head">
                <strong>{copy.generate.connectedSession}</strong>
                <span className="small">{copy.generate.continueLocal}</span>
              </div>
              <p className="section-note">{resumeHint}</p>
              <div className="form-actions">
                <button type="button" onClick={() => onViewJobs(activeSession?.sessionId)}>
                  <FolderClock size={16} />
                  <span>{copy.generate.openHistory}</span>
                </button>
                {currentCacheReady && activeSession && activeSession.status !== "completed" ? (
                  <button type="button" onClick={() => void onResumeRender()} disabled={loading}>
                    <Video size={16} />
                    <span>{loading ? copy.generate.continuing : copy.generate.continueFinalize}</span>
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <form onSubmit={onSubmit} className="generate-workspace-form">
            <section className="generate-upload-card" role="region" aria-label="slot video 1">
              <div className="generate-section-head">
                <div>
                  <span className="generate-section-label">{copy.generate.uploadSection}</span>
                  <h3>{copy.generate.mainVideo}</h3>
                  <p className="small">{copy.generate.uploadLead}</p>
                </div>
                <span
                  className={
                    isFormReady(form)
                      ? "batch-slot-status batch-slot-status-ready"
                      : "batch-slot-status batch-slot-status-empty"
                  }
                >
                  {isFormReady(form) ? copy.generate.slotReady : copy.generate.incomplete}
                </span>
              </div>

              <label className="generate-upload-label">
                <span className="generate-field-label">
                  {copy.generate.video} <span className="required-mark">*</span>
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
                      <h4>{form.video ? form.video.name : copy.generate.chooseVideo}</h4>
                      <p>{copy.generate.uploadHint}</p>
                    </div>
                  </div>
                  <div className="generate-upload-side">
                    <div className="generate-ready-indicator">
                      <span className="generate-ready-dot" aria-hidden="true" />
                      <span>{formDisabled ? copy.generate.incomplete : copy.generate.slotReady}</span>
                    </div>
                    <span className="generate-upload-trigger">{copy.generate.chooseFile}</span>
                  </div>
                </div>
              </label>

              <div className="generate-upload-meta">
                <div className="generate-meta-item">
                  <Gauge size={15} strokeWidth={2} />
                  <div>
                    <span className="generate-meta-label">{copy.generate.duration}</span>
                    <strong className="generate-meta-value">
                      {form.durationPending
                        ? copy.generate.reading
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
                    <span className="generate-meta-label">{copy.generate.cost}</span>
                    <strong className="generate-meta-value">
                      {currentUser.isUnlimited ? copy.dashboard.unlimited : formatIdrCurrency(estimatedChargeIdr, locale)}
                    </strong>
                  </div>
                </div>
                <div className="generate-meta-divider" aria-hidden="true" />
                <div className="generate-meta-item">
                  <Mic2 size={15} strokeWidth={2} />
                  <div>
                    <span className="generate-meta-label">{copy.generate.mode}</span>
                    <strong className="generate-meta-value">{copy.generate.flatPerProcess}</strong>
                  </div>
                </div>
              </div>

              {form.durationError ? <p className="err-inline">{form.durationError}</p> : null}
            </section>

            <section className="generate-fields-card">
              <div className="generate-section-head">
                <div>
                  <span className="generate-section-label">{copy.generate.detailsSection}</span>
                  <h3>{copy.generate.detailsTitle}</h3>
                  <p className="small">{copy.generate.detailsLead}</p>
                </div>
              </div>

                <div className="generate-field-grid">
                  <label className="generate-field">
                    <span className="generate-field-label">
                      {copy.generate.generateMode} <span className="required-mark">*</span>
                    </span>
                    <div className="generate-input-wrap">
                      <select
                        value={form.scriptMode}
                        onChange={(event) =>
                          updateForm((current) => ({
                            ...current,
                            scriptMode: event.target.value as ScriptMode
                          }))
                        }
                        disabled={formDisabled}
                      >
                        {SCRIPT_MODE_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {getScriptModeLabel(locale, item)}
                          </option>
                        ))}
                      </select>
                      <span className="generate-input-icon" aria-hidden="true">
                        <Sparkles size={16} strokeWidth={2} />
                      </span>
                    </div>
                    <p className="small generate-field-hint">
                      {copy.generate.generateModeHint}
                    </p>
                  </label>

                  <label className="generate-field">
                    <span className="generate-field-label">
                      {copy.generate.title} <span className="required-mark">*</span>
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
                      placeholder={copy.generate.titlePlaceholder}
                    />
                    <span className="generate-input-icon" aria-hidden="true">
                      <PenSquare size={16} strokeWidth={2} />
                    </span>
                  </div>
                </label>

                {usesManualScript ? (
                  <label className="generate-field">
                    <span className="generate-field-label">
                      {copy.generate.manualScript} <span className="required-mark">*</span>
                    </span>
                    <textarea
                      rows={7}
                      value={form.manualScriptText}
                      onChange={(event) =>
                        updateForm((current) => ({
                          ...current,
                          manualScriptText: event.target.value
                        }))
                      }
                      disabled={formDisabled}
                      placeholder={copy.generate.manualScriptPlaceholder}
                    />
                    <p className="small generate-field-hint">
                      {copy.generate.manualScriptHint}
                    </p>
                  </label>
                ) : (
                  <label className="generate-field">
                    <span className="generate-field-label">
                      {copy.generate.description} <span className="required-mark">*</span>
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
                      placeholder={copy.generate.descriptionPlaceholder}
                    />
                  </label>
                )}

                <div className="generate-field-row">
                  <label className="generate-field">
                    <span className="generate-field-label">
                      {copy.generate.contentCategory} <span className="required-mark">*</span>
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
                            {getContentLabel(locale, item)}
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
                      {copy.generate.socialPlatform} <span className="required-mark">*</span>
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
                            {getPlatformLabel(locale, item)}
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
                      {copy.generate.voiceGender} <span className="required-mark">*</span>
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
                        {(["male", "female"] as JobVoiceGender[]).map((gender) => (
                          <option key={gender} value={gender}>
                            {getGenderLabel(locale, gender)}
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
                      {copy.generate.tone} <span className="required-mark">*</span>
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
                            {getToneLabel(locale, item)}
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
                    <span className="generate-field-label">{copy.generate.optionalCta}</span>
                    <div className="generate-input-wrap">
                      <input
                        value={form.ctaText}
                        placeholder={copy.generate.optionalCtaPlaceholder}
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
                    <span className="generate-field-label">{copy.generate.optionalReference}</span>
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
              <p className="generate-action-note small">
                {currentUser.isUnlimited
                  ? copy.generate.actionNoteUnlimited
                  : copy.generate.actionNoteMetered(formatIdrCurrency(estimatedChargeIdr, locale))}
              </p>

              <button type="submit" className="generate-submit-button" disabled={formDisabled}>
                <Sparkles size={17} strokeWidth={2} />
                <span>{loading ? flowState.label : copy.generate.processVideo}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <aside className="generate-side-panel">
        <div className="generate-side-head">
          <h3>{copy.generate.summary}</h3>
        </div>

        <section className="generate-side-card generate-compute-card">
          <div className="generate-compute-head">
            <div>
              <span className="generate-section-label">{copy.generate.workflowStatus}</span>
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
              {flowState.phase === "completed" ? copy.generate.flowRenderReady : loading ? copy.generate.flowProcessing : copy.generate.flowWaiting}
            </span>
          </div>

          <div className="generate-progress-stack">
            <div className="generate-progress-head">
              <span>{copy.generate.activeStep}</span>
              <strong>{flowState.label}</strong>
            </div>
            <div className="generate-progress-track">
              <div className="generate-progress-value" style={{ width: `${flowState.percent}%` }} />
            </div>
          </div>

          <div className="generate-compute-metrics">
            <div className="generate-compute-metric">
              <Gauge size={15} strokeWidth={2} />
              <span>{copy.generate.visualClips}</span>
              <strong>{copy.generate.automatic}</strong>
            </div>
            <div className="generate-compute-metric">
              <Video size={15} strokeWidth={2} />
              <span>{copy.generate.finalization}</span>
              <strong>{copy.generate.slotReady}</strong>
            </div>
          </div>
        </section>

        <section className="generate-side-card">
          <span className="generate-section-label">{copy.generate.costBalance}</span>
          <div className="generate-stat-list">
            <div className="generate-stat-row">
              <span>{copy.generate.sessionCost}</span>
              <strong>
                {currentUser.isUnlimited ? copy.dashboard.unlimited : formatIdrCurrency(estimatedChargeIdr, locale)}
              </strong>
            </div>
            <div className="generate-stat-row">
              <span>{copy.generate.remainingBalance}</span>
              <strong>
                {currentUser.isUnlimited
                  ? copy.generate.unlimitedBalance
                  : formatIdrCurrency(projectedBalanceIdr ?? currentUser.walletBalanceIdr, locale)}
              </strong>
            </div>
            <div className="generate-stat-row">
              <span>{copy.generate.balanceStatus}</span>
              <strong>{hasEnoughBalance ? copy.generate.balanceReady : copy.generate.needTopup}</strong>
            </div>
            <p className="small">
              {currentUser.isUnlimited
                ? copy.generate.unlimitedLead
                : copy.generate.flatGeneratePrice(formatIdrCurrency(currentUser.generatePriceIdr, locale))}
            </p>
          </div>
        </section>

        {activeSession ? (
          <section className="generate-side-card">
            <span className="generate-section-label">{copy.generate.aiSession}</span>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon">
                <Sparkles size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">{copy.generate.pipelineStatus}</p>
                <strong>{activeSession.status}</strong>
              </div>
            </div>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon generate-pipeline-icon-magenta">
                <Mic2 size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">{copy.generate.voice}</p>
                <strong>{activeSession.voiceName || copy.generate.defaultVoice}</strong>
              </div>
            </div>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon">
                <PenSquare size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">{copy.generate.generateMode}</p>
                <strong>{getScriptModeLabel(locale, activeSession.scriptMode)}</strong>
              </div>
            </div>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon">
                <Layers3 size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">
                  {activeSession.scriptMode === "manual_script"
                    ? copy.generate.sourceScript
                    : copy.generate.analyzedClips}
                </p>
                <strong>
                  {activeSession.scriptMode === "manual_script"
                    ? copy.jobs.manualScript
                    : copy.jobs.clips(activeSession.frameCount)}
                </strong>
              </div>
            </div>
            <div className="generate-pipeline-item">
              <div className="generate-pipeline-icon">
                <Globe size={18} strokeWidth={2} />
              </div>
              <div>
                <p className="generate-pipeline-title">{copy.generate.targetPlatform}</p>
                <strong>{getPlatformLabel(locale, activeSession.socialPlatform)}</strong>
              </div>
            </div>
            {activeSession.scriptText ? (
              <p className="small break-anywhere">{activeSession.scriptText}</p>
            ) : null}
            {activeSession.captionText ? (
              <p className="small break-anywhere">
                {copy.generate.captionPrefix}: {activeSession.captionText}
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
              <h4>{copy.generate.finalReadyTitle}</h4>
              <p>
                {copy.generate.finalReadyLead(
                  `${(finalVideoBlob.size / (1024 * 1024)).toFixed(2)} MB`
                )}
              </p>
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => downloadBlob(finalVideoBlob, finalVideoName)}>
                <Download size={16} />
                <span>{copy.generate.downloadFinal}</span>
              </button>
              <button type="button" onClick={() => onViewJobs(activeSession?.sessionId)}>
                <FolderClock size={16} />
                <span>{copy.generate.openHistoryShort}</span>
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
