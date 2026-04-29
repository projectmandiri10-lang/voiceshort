import { useEffect, useState, type FormEvent } from "react";
import { fetchSettings, fetchTtsVoices, previewTtsVoice, updateSettings } from "../api";
import type { AppSettings, JobVoiceGender, TtsVoiceOption } from "../types";

const GENDER_LABEL: Record<JobVoiceGender, string> = {
  male: "Pria",
  female: "Wanita"
};

function findVoiceConfig(settings: AppSettings, gender: JobVoiceGender) {
  return settings.genderVoices.find((voice) => voice.gender === gender);
}

function voiceMatchesGender(voice: TtsVoiceOption, gender: JobVoiceGender): boolean {
  return voice.gender === gender || voice.gender === "neutral";
}

function toAbsoluteOutputUrl(outputPath: string): string {
  if (typeof window === "undefined") {
    return outputPath;
  }
  return new URL(outputPath, window.location.origin).toString();
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [voiceOptions, setVoiceOptions] = useState<TtsVoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<JobVoiceGender | null>(null);
  const [previewPaths, setPreviewPaths] = useState<Partial<Record<JobVoiceGender, string>>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [voiceCatalogError, setVoiceCatalogError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [loadedSettings, voiceData] = await Promise.all([fetchSettings(), fetchTtsVoices()]);
        if (!mounted) {
          return;
        }
        setSettings(loadedSettings);
        setVoiceOptions(Array.isArray(voiceData.voices) ? voiceData.voices : []);
        setError("");
        setVoiceCatalogError("");
      } catch (loadError) {
        if (mounted) {
          setError((loadError as Error).message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const onGenderVoiceChange = (
    gender: JobVoiceGender,
    key: "voiceName" | "speechRate",
    value: string | number
  ) => {
    if (!settings) {
      return;
    }
    const genderVoices = settings.genderVoices.map((voice) =>
      voice.gender === gender ? { ...voice, [key]: value } : voice
    );
    setSettings({ ...settings, genderVoices });
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) {
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const saved = await updateSettings(settings);
      setSettings(saved);
      setMessage("Pengaturan berhasil disimpan.");
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onPreview = async (gender: JobVoiceGender) => {
    if (!settings) {
      return;
    }
    const selected = findVoiceConfig(settings, gender);
    if (!selected) {
      return;
    }

    setPreviewLoading(gender);
    setMessage("");
    setError("");
    try {
      const result = await previewTtsVoice({
        voiceName: selected.voiceName,
        speechRate: selected.speechRate,
        text:
          gender === "male"
            ? "Halo, ini contoh voice over pria untuk video short general yang natural dan jelas."
            : "Halo, ini contoh voice over wanita untuk video short general yang ringan dan menarik."
      });
      setPreviewPaths((current) => ({
        ...current,
        [gender]: result.previewPath
      }));
    } catch (previewError) {
      setError((previewError as Error).message);
    } finally {
      setPreviewLoading(null);
    }
  };

  if (loading || !settings) {
    return (
      <section className="card">
        <h2>Pengaturan Layanan</h2>
        <p>Memuat pengaturan...</p>
        {error && <p className="err-text">{error}</p>}
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Pengaturan Layanan</h2>
      <p className="section-note">
        Atur batas durasi maksimal 60 detik dan pilihan suara default untuk setiap proses.
      </p>
      <form className="grid-form" onSubmit={onSave}>
        <label>
          Batas Durasi Video
          <input
            type="number"
            min={10}
            max={60}
            value={settings.maxVideoSeconds}
            onChange={(event) =>
              setSettings({ ...settings, maxVideoSeconds: Number(event.target.value) })
            }
          />
        </label>
        <div className="style-grid">
          {(["male", "female"] as JobVoiceGender[]).map((gender) => {
            const selected = findVoiceConfig(settings, gender);
            const options = voiceOptions.filter((voice) => voiceMatchesGender(voice, gender));
            return (
              <article className="style-card" key={gender}>
                <h3>{GENDER_LABEL[gender]}</h3>
                <label>
                  Pilihan Suara
                  <select
                    value={selected?.voiceName ?? ""}
                    disabled={!selected || !voiceOptions.length}
                    onChange={(event) =>
                      onGenderVoiceChange(gender, "voiceName", event.target.value)
                    }
                  >
                    {options.map((voice) => (
                      <option key={voice.voiceName} value={voice.voiceName}>
                        {voice.label} - {voice.tone} ({voice.gender})
                      </option>
                    ))}
                  </select>
                  {voiceCatalogError && (
                    <span className="small err-inline">
                      Gagal memuat katalog voice: {voiceCatalogError}
                    </span>
                  )}
                </label>
                <label>
                  Kecepatan Bicara
                  <input
                    type="number"
                    step="0.05"
                    min={0.7}
                    max={1.3}
                    value={selected?.speechRate ?? 1}
                    onChange={(event) =>
                      onGenderVoiceChange(gender, "speechRate", Number(event.target.value))
                    }
                  />
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    onClick={() => void onPreview(gender)}
                    disabled={previewLoading === gender}
                  >
                    {previewLoading === gender ? "Membuat Preview..." : "Preview Suara"}
                  </button>
                </div>
                {previewPaths[gender] ? (
                  <audio
                    className="audio-preview"
                    controls
                    src={toAbsoluteOutputUrl(previewPaths[gender] || "")}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </form>
      {message && <p className="ok-text">{message}</p>}
      {error && <p className="err-text">{error}</p>}
    </section>
  );
}
