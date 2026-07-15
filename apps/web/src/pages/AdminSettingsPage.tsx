import { useEffect, useState, type FormEvent } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { fetchSettings, updateSettings } from "../api";
import { AIVENE_SCRIPT_MODELS } from "../shared/constants";
import type { AppSettings } from "../types";

const MODEL_LABELS: Record<(typeof AIVENE_SCRIPT_MODELS)[number], string> = {
  "qwen3.5-flash": "Qwen 3.5 Flash - paling hemat",
  "qwen3.6-plus": "Qwen 3.6 Plus",
  "qwen3.7-plus": "Qwen 3.7 Plus - rekomendasi"
};

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void fetchSettings()
      .then((result) => {
        if (mounted) setSettings(result);
      })
      .catch((cause) => {
        if (mounted) setError((cause as Error).message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await updateSettings({
        ...settings,
        scriptProvider: "aivene",
        scriptFallbackProvider: "zai"
      });
      setSettings(saved);
      window.alert("Pengaturan model AI berhasil disimpan.");
    } catch (cause) {
      const message = (cause as Error).message || "Pengaturan model AI gagal disimpan.";
      setError(message);
      window.alert(`Gagal menyimpan pengaturan model AI: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="card"><p>Memuat pengaturan AI...</p></section>;
  if (!settings) return <section className="card"><p className="err-text">{error || "Pengaturan AI tidak tersedia."}</p></section>;

  return (
    <section className="card settings-card">
      <header className="section-heading">
        <div>
          <span className="eyebrow"><ShieldCheck size={15} /> Superadmin</span>
          <h2>Model analisis video</h2>
          <p>Pilih model utama Aivene. Jika gagal, Worker otomatis memakai GLM-5V Turbo langsung dari Z.AI.</p>
        </div>
      </header>

      <form onSubmit={save} className="grid-form">
        <label>
          Model utama
          <select
            aria-label="Model utama"
            value={settings.scriptModel}
            onChange={(event) => setSettings({ ...settings, scriptModel: event.target.value })}
          >
            {AIVENE_SCRIPT_MODELS.map((model) => (
              <option key={model} value={model}>{MODEL_LABELS[model]}</option>
            ))}
          </select>
        </label>

        <div className="settings-provider-summary">
          <p><strong>Provider utama:</strong> Aivene</p>
          <p><strong>Fallback:</strong> Z.AI direct · GLM-5V Turbo</p>
          <p><strong>Reasoning utama:</strong> Medium</p>
        </div>

        {error ? <p className="err-text">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={17} /> {saving ? "Menyimpan..." : "Simpan pengaturan"}
        </button>
      </form>
    </section>
  );
}
