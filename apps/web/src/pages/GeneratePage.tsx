import { useState, type FormEvent } from "react";
import { ApiError, createJob, fetchGenerationCapacity } from "../api";
import { useEffect } from "react";
import { CONTENT_LABEL, GENDER_LABEL, TONE_OPTIONS } from "../job-form-options";
import type { AuthUser, ContentType, GenerationCapacity, JobVoiceGender } from "../types";
import { CONTENT_TYPES } from "../types";

const MAX_BATCH_SLOTS = 10;
const DEFAULT_CONTENT_TYPE: ContentType = "affiliate";
const DEFAULT_VOICE_GENDER: JobVoiceGender = "female";
const DEFAULT_TONE = "natural";
const SERVER_OVERLOAD_FALLBACK =
  "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi.";

type SlotVisualStatus = "kosong" | "siap" | "belum lengkap" | "mengirim" | "berhasil" | "gagal";
type SlotSubmitState = "idle" | "submitting" | "success" | "failed";

interface BatchSlotState {
  slotNumber: number;
  video: File | null;
  title: string;
  description: string;
  hashtagHintsText: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  ctaText: string;
  referenceLink: string;
  fileInputKey: number;
  submitState: SlotSubmitState;
  error: string;
}

interface BatchSummary {
  successJobs: Array<{ slotNumber: number; jobId: string }>;
  failedSlots: Array<{ slotNumber: number; message: string }>;
  incompleteSlots: number[];
}

interface GeneratePageProps {
  currentUser: AuthUser;
  onRefreshSession: () => Promise<void>;
  onViewJobs: (jobId?: string) => void;
}

function createEmptySlot(slotNumber: number): BatchSlotState {
  return {
    slotNumber,
    video: null,
    title: "",
    description: "",
    hashtagHintsText: "",
    contentType: DEFAULT_CONTENT_TYPE,
    voiceGender: DEFAULT_VOICE_GENDER,
    tone: DEFAULT_TONE,
    ctaText: "",
    referenceLink: "",
    fileInputKey: 0,
    submitState: "idle",
    error: ""
  };
}

function createInitialSlots(): BatchSlotState[] {
  return Array.from({ length: MAX_BATCH_SLOTS }, (_, index) => createEmptySlot(index + 1));
}

function normalizeHashtagHints(text: string): string[] | undefined {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of text.split(/\r?\n|,/g)) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result.length ? result : undefined;
}

function isSlotEmpty(slot: BatchSlotState): boolean {
  return (
    !slot.video &&
    !slot.title.trim() &&
    !slot.description.trim() &&
    !slot.hashtagHintsText.trim() &&
    !slot.ctaText.trim() &&
    !slot.referenceLink.trim() &&
    slot.contentType === DEFAULT_CONTENT_TYPE &&
    slot.voiceGender === DEFAULT_VOICE_GENDER &&
    slot.tone === DEFAULT_TONE
  );
}

function isSlotReady(slot: BatchSlotState): boolean {
  return Boolean(
    slot.video &&
      slot.title.trim() &&
      slot.description.trim() &&
      slot.contentType &&
      slot.voiceGender &&
      slot.tone.trim()
  );
}

function getSlotVisualStatus(slot: BatchSlotState): SlotVisualStatus {
  if (slot.submitState === "submitting") {
    return "mengirim";
  }
  if (slot.submitState === "success") {
    return "berhasil";
  }
  if (slot.submitState === "failed") {
    return "gagal";
  }
  if (isSlotEmpty(slot)) {
    return "kosong";
  }
  if (isSlotReady(slot)) {
    return "siap";
  }
  return "belum lengkap";
}

function getSlotStatusLabel(status: SlotVisualStatus): string {
  switch (status) {
    case "kosong":
      return "Kosong";
    case "siap":
      return "Siap";
    case "belum lengkap":
      return "Belum Lengkap";
    case "mengirim":
      return "Mengirim";
    case "berhasil":
      return "Berhasil";
    case "gagal":
      return "Gagal";
  }
}

function getSlotStatusClassName(status: SlotVisualStatus): string {
  switch (status) {
    case "kosong":
      return "batch-slot-status batch-slot-status-empty";
    case "siap":
      return "batch-slot-status batch-slot-status-ready";
    case "belum lengkap":
      return "batch-slot-status batch-slot-status-incomplete";
    case "mengirim":
      return "batch-slot-status batch-slot-status-submitting";
    case "berhasil":
      return "batch-slot-status batch-slot-status-success";
    case "gagal":
      return "batch-slot-status batch-slot-status-failed";
  }
}

function buildOverloadedCapacity(
  message: string,
  current: GenerationCapacity | null
): GenerationCapacity {
  return {
    overloaded: true,
    runningCount: current?.runningCount ?? 0,
    queuedCount: current?.queuedCount ?? 0,
    maxRunningJobs: current?.maxRunningJobs ?? 3,
    maxQueuedJobs: current?.maxQueuedJobs ?? 20,
    maxRunningPerUser: current?.maxRunningPerUser ?? 1,
    message
  };
}

function isServerOverloadError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 503;
  }

  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return message.includes("server overload");
}

export function GeneratePage({ currentUser, onRefreshSession, onViewJobs }: GeneratePageProps) {
  const [slots, setSlots] = useState<BatchSlotState[]>(() => createInitialSlots());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [capacity, setCapacity] = useState<GenerationCapacity | null>(null);

  const canGenerate = currentUser.isUnlimited || currentUser.walletBalanceIdr >= currentUser.generatePriceIdr;
  const isServerOverloaded = Boolean(capacity?.overloaded);

  useEffect(() => {
    let mounted = true;

    const loadCapacity = async () => {
      try {
        const next = await fetchGenerationCapacity();
        if (!mounted) {
          return;
        }
        setCapacity(next);
      } catch {
        // Keep the last known capacity state if polling fails.
      }
    };

    void loadCapacity();
    const timer = window.setInterval(() => {
      void loadCapacity();
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const updateSlot = (slotNumber: number, updater: (slot: BatchSlotState) => BatchSlotState) => {
    setSlots((current) =>
      current.map((slot) => {
        if (slot.slotNumber !== slotNumber) {
          return slot;
        }

        const next = updater(slot);
        return {
          ...next,
          submitState: "idle",
          error: ""
        };
      })
    );
  };

  const markIncompleteSlots = (slotNumbers: number[]) => {
    const slotNumberSet = new Set(slotNumbers);
    setSlots((current) =>
      current.map((slot) => {
        if (!slotNumberSet.has(slot.slotNumber)) {
          return slot;
        }
        return {
          ...slot,
          submitState: "idle",
          error: "Lengkapi video, judul, brief/deskripsi, kategori, gender suara, dan tone."
        };
      })
    );
  };

  const resetSlotAfterSuccess = (slotNumber: number) => {
    setSlots((current) =>
      current.map((slot) => {
        if (slot.slotNumber !== slotNumber) {
          return slot;
        }
        return {
          ...createEmptySlot(slot.slotNumber),
          fileInputKey: slot.fileInputKey + 1
        };
      })
    );
  };

  const setSubmittingState = (slotNumber: number) => {
    setSlots((current) =>
      current.map((slot) =>
        slot.slotNumber === slotNumber
          ? {
              ...slot,
              submitState: "submitting",
              error: ""
            }
          : slot
      )
    );
  };

  const setFailedState = (slotNumber: number, message: string) => {
    setSlots((current) =>
      current.map((slot) =>
        slot.slotNumber === slotNumber
          ? {
              ...slot,
              submitState: "failed",
              error: message
            }
          : slot
      )
    );
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSummary(null);

    if (isServerOverloaded) {
      setError(capacity?.message || SERVER_OVERLOAD_FALLBACK);
      return;
    }

    if (!canGenerate) {
      setError("Saldo belum cukup. Isi saldo minimal untuk memproses 1 video.");
      return;
    }

    const incompleteSlots = slots
      .filter((slot) => !isSlotEmpty(slot) && !isSlotReady(slot))
      .map((slot) => slot.slotNumber);
    const readySlots = slots.filter((slot) => isSlotReady(slot));

    markIncompleteSlots(incompleteSlots);

    if (!readySlots.length) {
      setError("Belum ada video yang siap diproses. Lengkapi minimal satu video terlebih dahulu.");
      return;
    }

    if (!currentUser.isUnlimited && readySlots.length > (currentUser.generateCreditsRemaining ?? 0)) {
      setError(
        `Jumlah video siap diproses (${readySlots.length}) melebihi sisa saldo Anda (${currentUser.generateCreditsRemaining} video).`
      );
      return;
    }

    setLoading(true);
    const successJobs: BatchSummary["successJobs"] = [];
    const failedSlots: BatchSummary["failedSlots"] = [];

    try {
      for (const slot of readySlots) {
        setSubmittingState(slot.slotNumber);

        try {
          const result = await createJob({
            video: slot.video as File,
            title: slot.title.trim(),
            description: slot.description.trim(),
            hashtagHints: normalizeHashtagHints(slot.hashtagHintsText),
            contentType: slot.contentType,
            voiceGender: slot.voiceGender,
            tone: slot.tone.trim(),
            ctaText: slot.ctaText.trim(),
            referenceLink: slot.referenceLink.trim()
          });

          successJobs.push({
            slotNumber: slot.slotNumber,
            jobId: result.jobId
          });
          resetSlotAfterSuccess(slot.slotNumber);
        } catch (submitError) {
          const message = (submitError as Error).message;
          failedSlots.push({
            slotNumber: slot.slotNumber,
            message
          });
          setFailedState(slot.slotNumber, message);
          if (isServerOverloadError(submitError)) {
            setCapacity((current) => buildOverloadedCapacity(message || SERVER_OVERLOAD_FALLBACK, current));
            setError(message || SERVER_OVERLOAD_FALLBACK);
            break;
          }
        }
      }

      try {
        await onRefreshSession();
      } catch (refreshError) {
        setError(`Proses selesai, tetapi pembaruan saldo gagal: ${(refreshError as Error).message}`);
      }

      setSummary({
        successJobs,
        failedSlots,
        incompleteSlots
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card app-page-card">
      <div className="section-heading compact">
        <span className="eyebrow">Buat Voice Over</span>
        <h2>Siapkan voice over untuk sampai 10 video sekaligus</h2>
        <p>
          Setiap slot berisi satu video dan satu arahan. Saat diproses, video yang sudah siap akan
          dibuatkan voice over satu per satu, sementara slot kosong akan dilewati.
        </p>
      </div>

      <div className="quota-banner">
        <div>
          <strong>
            {currentUser.isUnlimited
              ? "Saldo Unlimited"
              : `Saldo deposit Rp${currentUser.walletBalanceIdr.toLocaleString("id-ID")}`}
          </strong>
          {currentUser.isUnlimited ? (
            <p className="small">Akun whitelist dapat memproses video tanpa batas saldo.</p>
          ) : (
            <p className="small">
              Biaya Rp{currentUser.generatePriceIdr.toLocaleString("id-ID")} per video. Sisa estimasi:{" "}
              {currentUser.generateCreditsRemaining} video.
            </p>
          )}
        </div>
        {!canGenerate ? (
          <span className="status status-failed">Perlu isi saldo</span>
        ) : (
          <span className="status status-success">Siap diproses</span>
        )}
      </div>

      {isServerOverloaded ? (
        <div className="notice-box notice-box-overload">
          <div className="row-head">
            <strong>Server overload</strong>
            <span className="small">
              Aktif {capacity?.runningCount ?? 0}/{capacity?.maxRunningJobs ?? 3} | Antrean{" "}
              {capacity?.queuedCount ?? 0}/{capacity?.maxQueuedJobs ?? 20}
            </span>
          </div>
          <p className="err-text">{capacity?.message || SERVER_OVERLOAD_FALLBACK}</p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid-form">
        <div className="generate-batch-grid">
          {slots.map((slot) => {
            const slotStatus = getSlotVisualStatus(slot);
            return (
              <section
                key={slot.slotNumber}
                role="region"
                className="batch-slot-card"
                aria-label={`Slot video ${slot.slotNumber}`}
              >
                <div className="batch-slot-header">
                  <div>
                    <strong>Slot {slot.slotNumber}</strong>
                    <p className="small">Video ini akan diproses sebagai 1 hasil terpisah.</p>
                  </div>
                  <span className={getSlotStatusClassName(slotStatus)}>
                    {getSlotStatusLabel(slotStatus)}
                  </span>
                </div>

                <div className="grid-form">
                  <label>
                    Video
                    <input
                      key={slot.fileInputKey}
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        updateSlot(slot.slotNumber, (current) => ({
                          ...current,
                          video: event.target.files?.[0] || null
                        }))
                      }
                      disabled={loading || !canGenerate}
                    />
                  </label>
                  {slot.video ? <p className="small break-anywhere">{slot.video.name}</p> : null}

                  <label>
                    Judul
                    <input
                      value={slot.title}
                      onChange={(event) =>
                        updateSlot(slot.slotNumber, (current) => ({
                          ...current,
                          title: event.target.value
                        }))
                      }
                      disabled={loading || !canGenerate}
                    />
                  </label>

                  <label>
                    Brief / Deskripsi
                    <textarea
                      rows={5}
                      value={slot.description}
                      onChange={(event) =>
                        updateSlot(slot.slotNumber, (current) => ({
                          ...current,
                          description: event.target.value
                        }))
                      }
                      disabled={loading || !canGenerate}
                    />
                  </label>

                  <div className="form-grid-2">
                    <label>
                      Kategori Konten
                      <select
                        value={slot.contentType}
                        onChange={(event) =>
                          updateSlot(slot.slotNumber, (current) => ({
                            ...current,
                            contentType: event.target.value as ContentType
                          }))
                        }
                        disabled={loading || !canGenerate}
                      >
                        {CONTENT_TYPES.map((item) => (
                          <option key={item} value={item}>
                            {CONTENT_LABEL[item]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Gender Suara
                      <select
                        value={slot.voiceGender}
                        onChange={(event) =>
                          updateSlot(slot.slotNumber, (current) => ({
                            ...current,
                            voiceGender: event.target.value as JobVoiceGender
                          }))
                        }
                        disabled={loading || !canGenerate}
                      >
                        {(Object.keys(GENDER_LABEL) as JobVoiceGender[]).map((gender) => (
                          <option key={gender} value={gender}>
                            {GENDER_LABEL[gender]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="form-grid-2">
                    <label>
                      Tone
                      <select
                        value={slot.tone}
                        onChange={(event) =>
                          updateSlot(slot.slotNumber, (current) => ({
                            ...current,
                            tone: event.target.value
                          }))
                        }
                        disabled={loading || !canGenerate}
                      >
                        {TONE_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      CTA Opsional
                      <input
                        value={slot.ctaText}
                        placeholder="Contoh: cek detailnya sekarang"
                        onChange={(event) =>
                          updateSlot(slot.slotNumber, (current) => ({
                            ...current,
                            ctaText: event.target.value
                          }))
                        }
                        disabled={loading || !canGenerate}
                      />
                    </label>
                  </div>

                  <label>
                    Link Referensi Opsional
                    <input
                      value={slot.referenceLink}
                      placeholder="https://..."
                      onChange={(event) =>
                        updateSlot(slot.slotNumber, (current) => ({
                          ...current,
                          referenceLink: event.target.value
                        }))
                      }
                      disabled={loading || !canGenerate}
                    />
                  </label>

                  <label>
                    Hashtag Arahan Opsional
                    <textarea
                      rows={3}
                      value={slot.hashtagHintsText}
                      placeholder="#affiliate, #fyp, organizer meja"
                      onChange={(event) =>
                        updateSlot(slot.slotNumber, (current) => ({
                          ...current,
                          hashtagHintsText: event.target.value
                        }))
                      }
                      disabled={loading || !canGenerate}
                    />
                  </label>

                  {slot.error ? <p className="err-inline">{slot.error}</p> : null}
                </div>
              </section>
            );
          })}
        </div>

        <button
          type="submit"
          className="primary-button"
          disabled={loading || !canGenerate || isServerOverloaded}
        >
          {loading ? "Memproses video..." : "Proses Video yang Siap"}
        </button>
      </form>

      {summary ? (
        <div className="notice-box">
          <div className="row-head">
            <strong>Ringkasan Hasil</strong>
            <span className="small">
              Berhasil {summary.successJobs.length} | Gagal {summary.failedSlots.length} | Perlu
              dilengkapi {summary.incompleteSlots.length}
            </span>
          </div>

          {summary.successJobs.length ? (
            <ul className="summary-list">
              {summary.successJobs.map((item) => (
                <li key={`${item.slotNumber}-${item.jobId}`}>
                  Slot {item.slotNumber}: proses <strong>#{item.jobId}</strong> berhasil dibuat.
                </li>
              ))}
            </ul>
          ) : null}

          {summary.failedSlots.length ? (
            <ul className="summary-list">
              {summary.failedSlots.map((item) => (
                <li key={`${item.slotNumber}-${item.message}`}>
                  Slot {item.slotNumber}: {item.message}
                </li>
              ))}
            </ul>
          ) : null}

          {summary.incompleteSlots.length ? (
            <p className="small">
              Slot perlu dilengkapi: {summary.incompleteSlots.map((item) => `#${item}`).join(", ")}
            </p>
          ) : null}

          {summary.successJobs.length ? (
            <div className="form-actions">
              <button type="button" onClick={() => onViewJobs(summary.successJobs[0]?.jobId)}>
                Buka Riwayat Proses
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}

