import { useEffect, useState, type FormEvent } from "react";
import { Gauge, Mic2, Save } from "lucide-react";
import { fetchSettings, previewTtsVoice, updateSettings } from "../api";
import { AI_PROVIDER_LABEL, getTtsVoices } from "../shared/constants";
import {
  SCRIPT_AI_PROVIDERS,
  TTS_AI_PROVIDERS,
  type AppSettings,
  type JobVoiceGender,
  type ScriptAiProvider,
  type TtsAiProvider,
  type TtsVoiceOption
} from "../types";

const GENDER_LABEL: Record<JobVoiceGender, string> = {
  male: "Pria",
  female: "Wanita",
};

function findVoiceConfig(settings: AppSettings, gender: JobVoiceGender) {
  return settings.genderVoices.find((voice) => voice.gender === gender);
}

function voiceMatchesGender(voice: TtsVoiceOption, gender: JobVoiceGender): boolean {
  return voice.gender === gender || voice.gender === "neutral";
}

function setProvider(
  settings: AppSettings,
  key: "scriptProvider" | "scriptFallbackProvider",
  value: ScriptAiProvider
): AppSettings {
  return { ...settings, [key]: value };
}

function setTtsProvider(
  settings: AppSettings,
  key: "ttsProvider" | "ttsFallbackProvider",
  value: TtsAiProvider
): AppSettings {
  return { ...settings, [key]: value };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<JobVoiceGender | null>(null);
  const [previewPaths, setPreviewPaths] = useState<Partial<Record<JobVoiceGender, string>>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const loadedSettings = await fetchSettings();
        if (!mounted) {
          return;
        }
        setSettings(loadedSettings);
        setError("");
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

  const onTtsProviderChange = (key: "ttsProvider" | "ttsFallbackProvider", value: TtsAiProvider) => {
    if (!settings) {
      return;
    }
    if (key === "ttsFallbackProvider") {
      setSettings(setTtsProvider(settings, key, value));
      return;
    }

    const nextVoiceOptions = getTtsVoices(value, settings.ttsModel);
    const nextGenderVoices = settings.genderVoices.map((voiceConfig) => {
      const current = nextVoiceOptions.find((voice) => voice.voiceName === voiceConfig.voiceName);
      if (current) {
        return voiceConfig;
      }
      const fallback =
        nextVoiceOptions.find((voice) => voiceMatchesGender(voice, voiceConfig.gender)) || nextVoiceOptions[0];
      return {
        ...voiceConfig,
        voiceName: fallback?.voiceName || voiceConfig.voiceName
      };
    });

    setSettings({
      ...setTtsProvider(settings, key, value),
      genderVoices: nextGenderVoices
    });
  };

  const onTtsModelChange = (value: string) => {
    if (!settings) {
      return;
    }
    const nextVoiceOptions = getTtsVoices(settings.ttsProvider, value);
    const nextGenderVoices = settings.genderVoices.map((voiceConfig) => {
      const current = nextVoiceOptions.find(
        (voice) => voice.voiceName.toLowerCase() === voiceConfig.voiceName.toLowerCase()
      );
      if (current) {
        return {
          ...voiceConfig,
          voiceName: current.voiceName
        };
      }
      const fallback =
        nextVoiceOptions.find((voice) => voiceMatchesGender(voice, voiceConfig.gender)) || nextVoiceOptions[0];
      return {
        ...voiceConfig,
        voiceName: fallback?.voiceName || voiceConfig.voiceName
      };
    });

    setSettings({
      ...settings,
      ttsModel: value,
      genderVoices: nextGenderVoices
    });
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
            ? "Halo, ini contoh voice over pria untuk video short sampai 60 detik yang natural dan jelas."
            : "Halo, ini contoh voice over wanita untuk video short sampai 60 detik yang ringan dan menarik.",
      });
      if (previewPaths[gender]) {
        URL.revokeObjectURL(previewPaths[gender] || "");
      }
      setPreviewPaths((current) => ({
        ...current,
        [gender]: result.audioUrl,
      }));
    } catch (previewError) {
      setError((previewError as Error).message);
    } finally {
      setPreviewLoading(null);
    }
  };

  const activeVoiceOptions = settings ? getTtsVoices(settings.ttsProvider, settings.ttsModel) : [];

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
    <section className="card app-page-card">
      <div className="section-heading compact">
        <span className="eyebrow">Pengaturan Layanan</span>
        <h2>Atur batas durasi dan suara default untuk setiap proses generate.</h2>
        <p className="section-note">
          Atur provider utama dan fallback untuk script maupun TTS. Aivene menjadi jalur utama untuk
          akses model Gemini melalui gateway OpenAI-compatible, OpenRouter tetap tersedia sebagai fallback,
          dan pajak transaksi dipakai sebagai snapshot pelaporan untuk top up baru.
        </p>
      </div>

      <form className="grid-form" onSubmit={onSave}>
        <div className="meta-grid">
          <div className="meta-card">
            <span className="small">Batas Durasi Video</span>
            <strong>{`${settings.maxVideoSeconds} detik`}</strong>
          </div>
          <div className="meta-card">
            <span className="small">Script Provider</span>
            <strong>{AI_PROVIDER_LABEL[settings.scriptProvider]}</strong>
          </div>
          <div className="meta-card">
            <span className="small">TTS Provider</span>
            <strong>{AI_PROVIDER_LABEL[settings.ttsProvider]}</strong>
          </div>
          <div className="meta-card">
            <span className="small">Pajak Transaksi</span>
            <strong>{`${settings.taxRatePercent.toFixed(2)}%`}</strong>
          </div>
        </div>

        <label>
          Batas Durasi Video
          <div className="row-head">
            <input
              type="number"
              min={10}
              max={60}
              value={settings.maxVideoSeconds}
              onChange={(event) => setSettings({ ...settings, maxVideoSeconds: Number(event.target.value) })}
            />
            <Gauge size={18} />
          </div>
        </label>

        <label>
          Pajak Transaksi (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={settings.taxRatePercent}
            onChange={(event) =>
              setSettings({ ...settings, taxRatePercent: Number(event.target.value) })
            }
          />
        </label>

        <div className="style-grid">
          <article className="style-card">
            <div className="row-head">
              <h3>Provider Script</h3>
            </div>
            <div className="grid-form">
              <label>
                Provider Utama
                <select
                  value={settings.scriptProvider}
                  onChange={(event) =>
                    setSettings(
                      setProvider(settings, "scriptProvider", event.target.value as ScriptAiProvider)
                    )
                  }
                >
                  {SCRIPT_AI_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {AI_PROVIDER_LABEL[provider]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Provider Fallback
                <select
                  value={settings.scriptFallbackProvider}
                  onChange={(event) =>
                    setSettings(
                      setProvider(
                        settings,
                        "scriptFallbackProvider",
                        event.target.value as ScriptAiProvider
                      )
                    )
                  }
                >
                  {SCRIPT_AI_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {AI_PROVIDER_LABEL[provider]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Model Script
                <input
                  value={settings.scriptModel}
                  onChange={(event) => setSettings({ ...settings, scriptModel: event.target.value })}
                />
              </label>

              <p className="small">
                Model script dipakai untuk visual brief, naskah, dan caption. Jika provider utama gagal,
                sistem otomatis mencoba provider fallback.
              </p>
            </div>
          </article>

          <article className="style-card">
            <div className="row-head">
              <h3>Provider TTS</h3>
            </div>
            <div className="grid-form">
              <label>
                Provider Utama
                <select
                  value={settings.ttsProvider}
                  onChange={(event) => onTtsProviderChange("ttsProvider", event.target.value as TtsAiProvider)}
                >
                  {TTS_AI_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {AI_PROVIDER_LABEL[provider]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Provider Fallback
                <select
                  value={settings.ttsFallbackProvider}
                  onChange={(event) =>
                    onTtsProviderChange("ttsFallbackProvider", event.target.value as TtsAiProvider)
                  }
                >
                  {TTS_AI_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {AI_PROVIDER_LABEL[provider]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Model TTS
                <input
                  value={settings.ttsModel}
                  onChange={(event) => onTtsModelChange(event.target.value)}
                />
              </label>

              <p className="small">
                Preview suara dan audio generate memakai provider TTS aktif, lalu fallback otomatis bila
                provider utama gagal.
              </p>
            </div>
          </article>
        </div>

        <div className="style-grid">
          {(["male", "female"] as JobVoiceGender[]).map((gender) => {
            const selected = findVoiceConfig(settings, gender);
            const options = activeVoiceOptions.filter((voice) => voiceMatchesGender(voice, gender));
            return (
              <article className="style-card" key={gender}>
                <div className="row-head">
                  <h3>{GENDER_LABEL[gender]}</h3>
                  <Mic2 size={18} />
                </div>

                <div className="grid-form">
                  <label>
                    Pilihan Suara
                    <select
                      value={selected?.voiceName ?? ""}
                      disabled={!selected || !activeVoiceOptions.length}
                      onChange={(event) => onGenderVoiceChange(gender, "voiceName", event.target.value)}
                    >
                      {options.map((voice) => (
                        <option key={voice.voiceName} value={voice.voiceName}>
                          {voice.label} - {voice.tone} ({voice.gender})
                        </option>
                      ))}
                    </select>
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

                  <p className="small">
                    Preview ini mengikuti provider TTS aktif dan fallback yang sedang tersimpan.
                  </p>

                  {previewPaths[gender] ? (
                    <audio className="audio-preview" controls src={previewPaths[gender] || ""} />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={16} />
          <span>{saving ? "Menyimpan..." : "Simpan Pengaturan"}</span>
        </button>
      </form>

      {message ? <p className="ok-text">{message}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
