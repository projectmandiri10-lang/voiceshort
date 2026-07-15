import { useEffect, useState, type FormEvent } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { fetchSettings, updateSettings } from "../api";
import { AIVENE_SCRIPT_MODELS, FREE_USER_AIVENE_SCRIPT_MODEL } from "../shared/constants";
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
      window.alert("Pengaturan AI dan langganan berhasil disimpan.");
    } catch (cause) {
      const message = (cause as Error).message || "Pengaturan model AI gagal disimpan.";
      setError(message);
      window.alert(`Gagal menyimpan pengaturan: ${message}`);
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

        <p className="settings-hint">
          Sepuluh analisis gratis memakai {FREE_USER_AIVENE_SCRIPT_MODEL} dari Aivene. Superadmin dan pelanggan aktif memakai model yang dipilih di atas.
        </p>

        <div className="settings-section-divider">
          <h3>Langganan QRIS statis</h3>
          <p>Pengguna memperoleh 10 analisis gratis. Pelanggan aktif memakai model utama yang dipilih di atas.</p>
        </div>

        <div className="personal-form-grid">
          <label>
            Harga langganan (Rp)
            <input type="number" min="1000" max="10000000" value={settings.subscriptionPriceIdr} onChange={(event) => setSettings({ ...settings, subscriptionPriceIdr: Number(event.target.value) })} />
          </label>
          <label>
            Masa aktif (hari)
            <input type="number" min="1" max="365" value={settings.subscriptionDays} onChange={(event) => setSettings({ ...settings, subscriptionDays: Number(event.target.value) })} />
          </label>
          <label className="span-2">
            Nama merchant
            <input value={settings.qrisMerchantName} onChange={(event) => setSettings({ ...settings, qrisMerchantName: event.target.value })} />
          </label>
          <label className="span-2">
            URL gambar QRIS statis
            <input type="text" placeholder="/qris/megakomindo-qris.jpg" value={settings.qrisImageUrl} onChange={(event) => setSettings({ ...settings, qrisImageUrl: event.target.value })} />
          </label>
          <label className="span-2">
            Instruksi pembayaran
            <textarea rows={3} value={settings.qrisInstructions} onChange={(event) => setSettings({ ...settings, qrisInstructions: event.target.value })} />
          </label>
        </div>

        {error ? <p className="err-text">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={17} /> {saving ? "Menyimpan..." : "Simpan pengaturan"}
        </button>
      </form>
    </section>
  );
}
