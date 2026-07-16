import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clipboard, LoaderCircle, RefreshCw, Sparkles, Wallet } from "lucide-react";
import {
  createTopup,
  fetchSession,
  fetchTopupConfig,
  fetchTopupStatus,
  fetchWallet
} from "../api";
import { supabase } from "../supabase";
import type { AuthUser, DepositPackage, PaymentOrder, TopupConfig, WalletSummary } from "../types";

interface SubscriptionPageProps {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onGenerate: () => void;
}

function rupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function SubscriptionPage({ user, onUserUpdated, onGenerate }: SubscriptionPageProps) {
  const [config, setConfig] = useState<TopupConfig | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [selectedPackageCode, setSelectedPackageCode] = useState<DepositPackage["code"]>("1_video");
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const handledPaidOrderIdRef = useRef<string | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [nextWallet, nextConfig] = await Promise.all([fetchWallet(), fetchTopupConfig()]);
      if (!active) return;
      setWallet(nextWallet);
      setConfig(nextConfig);
      const latestPending = nextWallet.recentTopups.find((item) => item.provider === "interactive_qris" && item.status === "pending") || null;
      if (latestPending) {
        setOrder((current) => current?.status === "paid" ? current : latestPending);
      }
      if (nextWallet.packages.length && !nextWallet.packages.some((item) => item.code === selectedPackageCode)) {
        setSelectedPackageCode(nextWallet.packages[0]!.code);
      }
    };

    void load()
      .catch((cause) => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });

    const timer = window.setInterval(() => void load().catch((cause) => active && setError((cause as Error).message)), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedPackageCode]);

  useEffect(() => () => {
    if (redirectTimerRef.current) {
      window.clearTimeout(redirectTimerRef.current);
    }
  }, []);

  const refreshWallet = async () => {
    const nextWallet = await fetchWallet();
    setWallet(nextWallet);
  };

  const handlePaidOrder = async (next: PaymentOrder) => {
    if (handledPaidOrderIdRef.current === next.id) return;
    handledPaidOrderIdRef.current = next.id;
    setOrder(next);
    const [nextUser] = await Promise.all([
      fetchSession(),
      refreshWallet()
    ]);
    if (nextUser) onUserUpdated(nextUser);
    setNotice("Pembayaran berhasil diverifikasi. Credit sudah masuk dan Anda diarahkan ke workspace naskah...");
    if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = window.setTimeout(() => {
      onGenerate();
    }, 1500);
  };

  const refreshOrder = async () => {
    if (!order) return;
    const next = await fetchTopupStatus(order.id);
    setOrder(next);
    if (next.status === "paid") {
      await handlePaidOrder(next);
    }
  };

  useEffect(() => {
    if (!order || order.status !== "pending") return;
    const timer = window.setInterval(() => void refreshOrder().catch((cause) => setError((cause as Error).message)), 5000);
    const channel = supabase?.channel(`payment-order-${order.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payment_orders",
          filter: `id=eq.${order.id}`
        },
        () => {
          void refreshOrder().catch((cause) => setError((cause as Error).message));
        }
      )
      .subscribe();
    return () => {
      window.clearInterval(timer);
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [order?.id, order?.status]);

  const createOrder = async () => {
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const next = await createTopup(selectedPackageCode);
      setOrder(next);
      await refreshWallet();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const copyAmount = async () => {
    if (!order?.totalAmountIdr) return;
    await navigator.clipboard.writeText(String(order.totalAmountIdr));
    setNotice("Nominal pembayaran disalin.");
  };

  const selectedPackage = wallet?.packages.find((item) => item.code === selectedPackageCode) || wallet?.packages[0] || null;
  const paymentOpen = Boolean(config?.paymentWindow.isOpen);

  if (loading) return <section className="card"><p>Memuat top up credit...</p></section>;

  return (
    <section className="personal-workspace">
      <header className="personal-workspace-head">
        <div>
          <span className="eyebrow"><Sparkles size={15} /> TOP UP CREDIT</span>
          <h1>Isi saldo untuk lanjut buat naskah video.</h1>
          <p>Setelah 10 naskah gratis habis, setiap naskah video voiceover memakai credit wallet. Pembayaran dilakukan dengan QRIS statis dan nominal unik.</p>
        </div>
      </header>

      <section className="card subscription-summary-card">
        <div>
          <span>Gratis tersisa</span>
          <strong>{user.freeAnalysisRemaining} dari {user.freeAnalysisLimit} naskah</strong>
        </div>
        <div>
          <span>Saldo saat ini</span>
          <strong>{rupiah(wallet?.walletBalanceIdr || 0)}</strong>
        </div>
        <div>
          <span>Sisa naskah dari saldo</span>
          <strong>{wallet?.generateCreditsRemaining ?? "Unlimited"} naskah</strong>
        </div>
      </section>

      <section className="card subscription-checkout-card">
        <div className="subscription-plan-copy">
          <h2>Pilih paket naskah video</h2>
          <p>Biaya sekarang sederhana: Rp1.000 untuk 1 naskah video voiceover. Pilih paket kecil yang paling nyaman lalu lanjut generate kapan saja.</p>
          <p className={paymentOpen ? "payment-window-open" : "payment-window-closed"}>
            Jam pembayaran normal: 05.00-22.00 WIB. Invoice berlaku 60 menit.
            {config?.paymentWindow.mode === "manual_open" && config.paymentWindow.manualOverrideUntil
              ? ` Saat ini dibuka manual admin sampai ${new Date(config.paymentWindow.manualOverrideUntil).toLocaleString("id-ID", { timeZone: config.paymentWindow.timeZone })}.`
              : ""}
            {config?.paymentWindow.mode === "manual_closed" && config.paymentWindow.manualOverrideUntil
              ? ` Saat ini ditutup manual admin sampai ${new Date(config.paymentWindow.manualOverrideUntil).toLocaleString("id-ID", { timeZone: config.paymentWindow.timeZone })}.`
              : ""}
            {!paymentOpen && config?.paymentWindow.nextOpenAt
              ? ` Dibuka kembali ${new Date(config.paymentWindow.nextOpenAt).toLocaleString("id-ID", { timeZone: config.paymentWindow.timeZone })}.`
              : ""}
          </p>
        </div>

        <div className="deposit-layout">
          <div className="deposit-package-grid">
            {(wallet?.packages || []).map((item) => (
              <button
                key={item.code}
                type="button"
                className={`deposit-package ${selectedPackageCode === item.code ? "active" : ""}`}
                onClick={() => setSelectedPackageCode(item.code)}
              >
                <strong>{item.label}</strong>
                <p>{rupiah(item.payAmountIdr)}</p>
                <span>Masuk saldo {rupiah(item.creditAmountIdr)}</span>
                <span>{item.generateCredits} naskah video</span>
                {item.bonusAmountIdr > 0 ? <span>Bonus {rupiah(item.bonusAmountIdr)}</span> : null}
              </button>
            ))}
          </div>

          <div className="deposit-checkout">
            <div className="meta-grid">
              <div className="meta-card">
                <span>Paket terpilih</span>
                <strong>{selectedPackage?.label || "-"}</strong>
              </div>
              <div className="meta-card">
                <span>Bayar dasar</span>
                <strong>{selectedPackage ? rupiah(selectedPackage.payAmountIdr) : "-"}</strong>
              </div>
              <div className="meta-card">
                <span>Credit masuk</span>
                <strong>{selectedPackage ? rupiah(selectedPackage.creditAmountIdr) : "-"}</strong>
              </div>
            </div>
            <p>Setiap Rp1.000 saldo setara dengan 1 naskah video voiceover.</p>

            {!order || order.status === "expired" || order.status === "failed" || order.status === "canceled" ? (
              <button
                className="primary-button"
                disabled={creating || !selectedPackage || !config?.webhookConfigured || !config?.qrisImageUrl || !paymentOpen}
                onClick={() => void createOrder()}
              >
                {creating ? <LoaderCircle className="spin" size={17} /> : <Wallet size={17} />}
                {creating ? "Membuat invoice..." : paymentOpen ? "Buat Invoice Top Up" : "Pembayaran Ditutup"}
              </button>
            ) : null}

            {config && (!config.webhookConfigured || !config.qrisImageUrl) ? (
              <p className="err-text">QRIS top up belum lengkap dikonfigurasi oleh admin.</p>
            ) : null}
          </div>
        </div>

        {order?.status === "pending" && config ? (
          <div className="subscription-payment-grid">
            <div className="subscription-qris-image-wrap">
              <img src={config.qrisImageUrl} alt={`QRIS ${config.merchantName}`} className="subscription-qris-image" />
              <strong>{config.merchantName}</strong>
            </div>
            <div className="subscription-payment-detail">
              <span>Bayar tepat sebesar</span>
              <strong className="subscription-total">{rupiah(order.totalAmountIdr || 0)}</strong>
              <button className="secondary-button" onClick={() => void copyAmount()}><Clipboard size={15} /> Salin nominal</button>
              <p>Harga {rupiah(order.payAmountIdr)} + pajak {rupiah(order.taxAmountIdr)} + kode unik <strong>{String(order.uniqueCode || "").padStart(2, "0")}</strong>.</p>
              <p>Credit yang masuk: <strong>{rupiah(order.creditAmountIdr)}</strong> atau {Math.floor(order.creditAmountIdr / 1000)} naskah video.</p>
              <p>{config.instructions}</p>
              <p>Invoice berlaku sampai {order.expiredAt ? new Date(order.expiredAt).toLocaleString("id-ID") : "-" }.</p>
              <button className="secondary-button" onClick={() => void refreshOrder().catch((cause) => setError((cause as Error).message))}><RefreshCw size={15} /> Periksa Pembayaran</button>
            </div>
          </div>
        ) : null}

        {order?.status === "paid" ? (
          <section className="subscription-active-card">
            <CheckCircle2 size={32} />
            <div><h2>Top up berhasil</h2><p>Saldo sudah bertambah dan pembuatan naskah bisa langsung dilanjutkan.</p></div>
            <button className="primary-button" onClick={onGenerate}>Mulai Buat Naskah</button>
          </section>
        ) : null}
      </section>

      {notice ? <p className="success-text">{notice}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
