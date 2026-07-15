import { useEffect, useState } from "react";
import { CheckCircle2, Clipboard, LoaderCircle, QrCode, RefreshCw, Sparkles } from "lucide-react";
import {
  createSubscriptionCheckout, fetchSession, fetchSubscriptionConfig, fetchSubscriptionOrderStatus
} from "../api";
import type { AuthUser, SubscriptionConfig, SubscriptionOrder } from "../types";

interface SubscriptionPageProps {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onGenerate: () => void;
}

function rupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function SubscriptionPage({ user, onUserUpdated, onGenerate }: SubscriptionPageProps) {
  const [config, setConfig] = useState<SubscriptionConfig | null>(null);
  const [order, setOrder] = useState<SubscriptionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const loadConfig = () => fetchSubscriptionConfig()
      .then((value) => { if (active) setConfig(value); })
      .catch((cause) => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    void loadConfig();
    const timer = window.setInterval(() => void loadConfig(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const refreshOrder = async () => {
    if (!order) return;
    const next = await fetchSubscriptionOrderStatus(order.id);
    setOrder(next);
    if (next.status === "paid") {
      const nextUser = await fetchSession();
      if (nextUser) onUserUpdated(nextUser);
      setNotice("Pembayaran berhasil diverifikasi. Langganan Anda sudah aktif.");
    }
  };

  useEffect(() => {
    if (!order || order.status !== "pending") return;
    const timer = window.setInterval(() => void refreshOrder().catch((cause) => setError((cause as Error).message)), 5000);
    return () => window.clearInterval(timer);
  }, [order?.id, order?.status]);

  const createOrder = async () => {
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const checkout = await createSubscriptionCheckout();
      setConfig(checkout.config);
      setOrder(checkout.order);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const copyAmount = async () => {
    if (!order) return;
    await navigator.clipboard.writeText(String(order.totalAmountIdr));
    setNotice("Nominal pembayaran disalin.");
  };

  const activeSubscription = user.subscriptionStatus === "active" && Boolean(user.subscriptionExpiresAt);
  const paymentOpen = Boolean(config?.paymentWindow.isOpen);
  if (loading) return <section className="card"><p>Memuat langganan...</p></section>;

  return (
    <section className="personal-workspace">
      <header className="personal-workspace-head">
        <div>
          <span className="eyebrow"><Sparkles size={15} /> LANGGANAN</span>
          <h1>Analisis premium dengan model admin.</h1>
          <p>Setiap akun memperoleh 10 analisis gratis. Setelah itu, aktifkan langganan untuk terus menggunakan model utama yang dipilih admin.</p>
        </div>
      </header>

      <section className="card subscription-summary-card">
        <div>
          <span>Gratis tersisa</span>
          <strong>{user.freeAnalysisRemaining} dari {user.freeAnalysisLimit}</strong>
        </div>
        <div>
          <span>Status langganan</span>
          <strong>{activeSubscription ? "Aktif" : "Belum aktif"}</strong>
        </div>
        {activeSubscription ? (
          <div>
            <span>Berlaku sampai</span>
            <strong>{new Date(user.subscriptionExpiresAt!).toLocaleString("id-ID")}</strong>
          </div>
        ) : null}
      </section>

      {activeSubscription ? (
        <section className="card subscription-active-card">
          <CheckCircle2 size={32} />
          <div><h2>Langganan aktif</h2><p>Anda dapat menganalisis video menggunakan model yang sama dengan superadmin.</p></div>
          <button className="primary-button" onClick={onGenerate}>Mulai Analisis</button>
        </section>
      ) : (
        <section className="card subscription-checkout-card">
          <div className="subscription-plan-copy">
            <h2>{config ? `${config.subscriptionDays} hari akses premium` : "Akses premium"}</h2>
            <strong>{config ? rupiah(config.priceIdr) : "-"}</strong>
            <p>Pembayaran menggunakan QRIS statis. Nominal unik dua digit wajib dibayar tepat agar webhook dapat mengenali invoice Anda.</p>
            <p className={paymentOpen ? "payment-window-open" : "payment-window-closed"}>
              Jam pembayaran: 05.00–22.00 WIB. Invoice berlaku 60 menit.
              {!paymentOpen && config?.paymentWindow.nextOpenAt
                ? ` Dibuka kembali ${new Date(config.paymentWindow.nextOpenAt).toLocaleString("id-ID", { timeZone: config.paymentWindow.timeZone })}.`
                : ""}
            </p>
          </div>

          {!order || order.status === "expired" || order.status === "canceled" ? (
            <button className="primary-button" disabled={creating || !config?.webhookConfigured || !config?.qrisImageUrl || !paymentOpen} onClick={() => void createOrder()}>
              {creating ? <LoaderCircle className="spin" size={17} /> : <QrCode size={17} />}
              {creating ? "Membuat invoice..." : paymentOpen ? "Buat Invoice QRIS" : "Pembayaran Ditutup"}
            </button>
          ) : null}

          {config && (!config.webhookConfigured || !config.qrisImageUrl) ? (
            <p className="err-text">QRIS langganan belum lengkap dikonfigurasi oleh admin.</p>
          ) : null}

          {order?.status === "pending" && config ? (
            <div className="subscription-payment-grid">
              <div className="subscription-qris-image-wrap">
                <img src={config.qrisImageUrl} alt={`QRIS ${config.merchantName}`} className="subscription-qris-image" />
                <strong>{config.merchantName}</strong>
              </div>
              <div className="subscription-payment-detail">
                <span>Bayar tepat sebesar</span>
                <strong className="subscription-total">{rupiah(order.totalAmountIdr)}</strong>
                <button className="secondary-button" onClick={() => void copyAmount()}><Clipboard size={15} /> Salin nominal</button>
                <p>Harga {rupiah(order.baseAmountIdr)} + kode unik <strong>{order.uniqueCode}</strong>.</p>
                <p>{config.instructions}</p>
                <p>Invoice berlaku sampai {new Date(order.expiresAt).toLocaleString("id-ID")}.</p>
                <button className="secondary-button" onClick={() => void refreshOrder().catch((cause) => setError((cause as Error).message))}><RefreshCw size={15} /> Periksa Pembayaran</button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {notice ? <p className="success-text">{notice}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
