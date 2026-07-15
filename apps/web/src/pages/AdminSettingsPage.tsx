import { useEffect, useState, type FormEvent } from "react";
import { Download, Save, ShieldCheck } from "lucide-react";
import { fetchSettings, fetchTopupConfig, setQrisPaymentWindowMode, updateSettings } from "../api";
import { AIVENE_SCRIPT_MODELS, FREE_USER_AIVENE_SCRIPT_MODEL } from "../shared/constants";
import type { AppSettings, QrisManualOverrideMode, TopupConfig } from "../types";

const MODEL_LABELS: Record<(typeof AIVENE_SCRIPT_MODELS)[number], string> = {
  "gpt-4o-mini": "gpt-4o-mini - paling hemat",
  "qwen3.6-plus": "Qwen 3.6 Plus",
  "qwen3.7-plus": "Qwen 3.7 Plus - rekomendasi"
};

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [topupConfig, setTopupConfig] = useState<TopupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [windowSaving, setWindowSaving] = useState<QrisManualOverrideMode | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const [settingsResult, topupResult] = await Promise.all([
        fetchSettings(),
        fetchTopupConfig()
      ]);
      if (mounted) {
        setSettings(settingsResult);
        setTopupConfig(topupResult);
      }
    };
    void refresh()
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
      window.alert("Pengaturan AI dan top up berhasil disimpan.");
    } catch (cause) {
      const message = (cause as Error).message || "Pengaturan model AI gagal disimpan.";
      setError(message);
      window.alert(`Gagal menyimpan pengaturan: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function changeQrisWindowMode(mode: QrisManualOverrideMode) {
    if (!settings || windowSaving) return;
    setWindowSaving(mode);
    setError("");
    try {
      const saved = await setQrisPaymentWindowMode(mode);
      const latestTopup = await fetchTopupConfig();
      setSettings(saved);
      setTopupConfig(latestTopup);
      window.alert(
        mode === "open"
          ? "QRIS dibuka manual sampai pergantian jadwal otomatis berikutnya."
          : mode === "closed"
            ? "QRIS ditutup manual sampai pergantian jadwal otomatis berikutnya."
            : "QRIS kembali mengikuti jadwal otomatis 05.00-22.00 WIB."
      );
    } catch (cause) {
      const message = (cause as Error).message || "Status QRIS tidak bisa diubah.";
      setError(message);
      window.alert(`Gagal mengubah status QRIS: ${message}`);
    } finally {
      setWindowSaving(null);
    }
  }

  if (loading) return <section className="card"><p>Memuat pengaturan AI...</p></section>;
  if (!settings) return <section className="card"><p className="err-text">{error || "Pengaturan AI tidak tersedia."}</p></section>;

  const paymentWindow = topupConfig?.paymentWindow;
  const paymentStatus = paymentWindow?.isOpen ? "Terbuka" : "Tertutup";
  const paymentDetail = paymentWindow?.mode === "manual_open"
    ? `Dibuka manual sampai ${paymentWindow.manualOverrideUntil ? new Date(paymentWindow.manualOverrideUntil).toLocaleString("id-ID", { timeZone: paymentWindow.timeZone }) : "-"}`
    : paymentWindow?.mode === "manual_closed"
      ? `Ditutup manual sampai ${paymentWindow.manualOverrideUntil ? new Date(paymentWindow.manualOverrideUntil).toLocaleString("id-ID", { timeZone: paymentWindow.timeZone }) : "-"}`
      : `Mengikuti jadwal otomatis ${paymentWindow?.opensAt || "05:00"}-${paymentWindow?.closesAt || "22:00"} WIB`;

  return (
    <section className="card settings-card">
      <header className="section-heading">
        <div>
          <span className="eyebrow"><ShieldCheck size={15} /> Superadmin</span>
          <h2>Model analisis video</h2>
          <p>Pilih model utama Aivene. Fallback Z.AI direct hanya tersedia untuk superadmin.</p>
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
          <p><strong>Fallback superadmin:</strong> Z.AI direct - GLM-5V Turbo</p>
          <p><strong>User gratis & top up:</strong> Aivene saja - tanpa Z.AI direct</p>
          <p><strong>Reasoning utama:</strong> Medium</p>
        </div>

        <p className="settings-hint">
          Sepuluh analisis gratis memakai {FREE_USER_AIVENE_SCRIPT_MODEL}. User yang sudah top up memakai model Aivene yang dipilih di atas. Hanya superadmin yang boleh memakai fallback Z.AI direct.
        </p>

        <div className="settings-section-divider">
          <h3>Top up QRIS statis</h3>
          <p>Admin cukup mengatur merchant, gambar QRIS, dan instruksi pembayaran. Paket top up dan nominal unik dikelola worker.</p>
        </div>

        <div className="settings-provider-summary">
          <p><strong>Status QRIS saat ini:</strong> {paymentStatus}</p>
          <p>{paymentDetail}</p>
          {paymentWindow?.mode !== "automatic" && paymentWindow?.nextAutomaticAt ? (
            <p><strong>Kembali otomatis:</strong> {new Date(paymentWindow.nextAutomaticAt).toLocaleString("id-ID", { timeZone: paymentWindow.timeZone })}</p>
          ) : null}
          <div className="settings-action-row">
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(windowSaving)}
              onClick={() => void changeQrisWindowMode("open")}
            >
              Buka manual
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(windowSaving)}
              onClick={() => void changeQrisWindowMode("closed")}
            >
              Tutup manual
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(windowSaving)}
              onClick={() => void changeQrisWindowMode("auto")}
            >
              Kembali otomatis
            </button>
          </div>
        </div>

        <div className="personal-form-grid">
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

        <div className="macrodroid-download-card">
          <div>
            <h3>MacroDroid webhook</h3>
            <p>
              File sudah berisi endpoint VoiceShort dan package InterActive QRIS{" "}
              <code>com.interactive.qrisid</code>. Secret sengaja dikosongkan.
            </p>
            <p>
              Setelah diimpor, isi secure global variable <code>VOICESHORT_QRIS_SECRET</code>{" "}
              dengan nilai <code>INTERACTIVE_QRIS_WEBHOOK_SECRET</code> dari file <code>.env</code> lokal.
            </p>
          </div>
          <a
            className="secondary-button"
            href="/downloads/voiceshort-interactive-qris.macro"
            download="voiceshort-interactive-qris.macro"
          >
            <Download size={17} /> Download MacroDroid
          </a>
        </div>

        {error ? <p className="err-text">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={17} /> {saving ? "Menyimpan..." : "Simpan pengaturan"}
        </button>
      </form>
    </section>
  );
}
