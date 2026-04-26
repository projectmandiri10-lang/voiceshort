import { useState, type FormEvent } from "react";
import { createJob } from "../api";
import { CONTENT_LABEL, GENDER_LABEL, TONE_OPTIONS } from "../job-form-options";
import { CONTENT_TYPES, type ContentType, type JobVoiceGender } from "../types";

interface GeneratePageProps {
  onJobCreated?: (jobId: string) => void;
}

export function GeneratePage({ onJobCreated }: GeneratePageProps) {
  const [video, setVideo] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState<ContentType>("affiliate");
  const [voiceGender, setVoiceGender] = useState<JobVoiceGender>("female");
  const [tone, setTone] = useState("natural");
  const [ctaText, setCtaText] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);

  const resetForm = () => {
    setVideo(null);
    setTitle("");
    setDescription("");
    setContentType("affiliate");
    setVoiceGender("female");
    setTone("natural");
    setCtaText("");
    setReferenceLink("");
    setFileInputKey((current) => current + 1);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!video || !title.trim() || !description.trim() || !tone.trim()) {
      setError(
        "Video, judul, brief/deskripsi, kategori konten, gender suara, dan tone wajib diisi."
      );
      return;
    }

    setLoading(true);
    try {
      const result = await createJob({
        video,
        title: title.trim(),
        description: description.trim(),
        contentType,
        voiceGender,
        tone: tone.trim(),
        ctaText: ctaText.trim(),
        referenceLink: referenceLink.trim()
      });
      resetForm();
      if (onJobCreated) {
        onJobCreated(result.jobId);
      } else {
        setMessage(`Job ${result.jobId} dibuat dengan status ${result.status}.`);
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>Generate</h2>
      <p>
        Upload satu video short maksimal 60 detik lalu isi brief, kategori konten, gender suara,
        dan tone untuk menghasilkan caption dan video final dengan voice over.
      </p>
      <form onSubmit={onSubmit} className="grid-form">
        <label>
          Video
          <input
            key={fileInputKey}
            id="video-input"
            type="file"
            accept="video/*"
            onChange={(event) => setVideo(event.target.files?.[0] || null)}
            disabled={loading}
          />
        </label>
        <label>
          Judul
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={loading}
          />
        </label>
        <label>
          Brief / Deskripsi
          <textarea
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={loading}
          />
        </label>
        <div className="form-grid-2">
          <label>
            Kategori Konten
            <select
              value={contentType}
              onChange={(event) => setContentType(event.target.value as ContentType)}
              disabled={loading}
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
              value={voiceGender}
              onChange={(event) => setVoiceGender(event.target.value as JobVoiceGender)}
              disabled={loading}
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
            <select value={tone} onChange={(event) => setTone(event.target.value)} disabled={loading}>
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
              value={ctaText}
              placeholder="Contoh: cek detailnya sekarang"
              onChange={(event) => setCtaText(event.target.value)}
              disabled={loading}
            />
          </label>
        </div>
        <label>
          Reference Link Opsional
          <input
            value={referenceLink}
            placeholder="https://..."
            onChange={(event) => setReferenceLink(event.target.value)}
            disabled={loading}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Memproses..." : "Generate Voice Over"}
        </button>
      </form>
      {message && <p className="ok-text">{message}</p>}
      {error && <p className="err-text">{error}</p>}
    </section>
  );
}
