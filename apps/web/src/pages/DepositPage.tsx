import { useEffect, useState } from "react";
import { History, QrCode, WalletMinimal } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  createTopup,
  fetchTopupStatus,
  fetchWallet,
  type DepositPackage,
  type PaymentOrder,
  type WalletSummary,
} from "../api";

interface DepositPageProps {
  onRefreshSession: () => Promise<void>;
}

function formatRupiah(value: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getPackageAccent(packageCode: DepositPackage["code"]): string {
  switch (packageCode) {
    case "10_video":
      return "starter";
    case "50_video":
      return "popular";
    case "100_video":
      return "scale";
  }
}

export function DepositPage({ onRefreshSession }: DepositPageProps) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [selectedPackageCode, setSelectedPackageCode] = useState<DepositPackage["code"]>("10_video");
  const [activeOrder, setActiveOrder] = useState<PaymentOrder | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState("");

  const selectedPackage = wallet?.packages.find((item) => item.code === selectedPackageCode) ?? wallet?.packages[0];

  const loadWallet = async () => {
    const nextWallet = await fetchWallet();
    setWallet(nextWallet);
    if (!nextWallet.packages.some((item) => item.code === selectedPackageCode)) {
      setSelectedPackageCode(nextWallet.packages[0]?.code ?? "10_video");
    }
  };

  useEffect(() => {
    let mounted = true;
    setLoadingWallet(true);
    fetchWallet()
      .then((nextWallet) => {
        if (!mounted) {
          return;
        }
        setWallet(nextWallet);
        setSelectedPackageCode(nextWallet.packages[0]?.code ?? "10_video");
      })
      .catch((loadError) => {
        if (mounted) {
          setError((loadError as Error).message);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingWallet(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "pending") {
      return;
    }
    const timer = window.setInterval(() => {
      fetchTopupStatus(activeOrder.id)
        .then(async (nextOrder) => {
          setActiveOrder(nextOrder);
          if (nextOrder.status === "paid") {
            await loadWallet();
            await onRefreshSession();
          }
        })
        .catch((statusError) => {
          setError((statusError as Error).message);
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeOrder, onRefreshSession]);

  const onCreateTopup = async () => {
    if (!selectedPackage) {
      return;
    }
    setError("");
    setCreatingOrder(true);
    try {
      const order = await createTopup(selectedPackage.code);
      setActiveOrder(order);
      await loadWallet();
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <section className="card app-page-card">
      <div className="section-heading compact">
        <span className="eyebrow">Isi Saldo</span>
        <h2>Isi saldo lewat QRIS dengan pembayaran otomatis.</h2>
        <p className="section-note">
          Biaya pembuatan voice over saat ini {formatRupiah(wallet?.generatePriceIdr ?? 2000)} per video.
        </p>
      </div>

      <div className="quota-banner deposit-balance">
        <div>
          <strong>
            {loadingWallet
              ? "Memuat saldo..."
              : wallet?.isUnlimited
                ? "Saldo Unlimited"
                : formatRupiah(wallet?.walletBalanceIdr)}
          </strong>
          <p className="small">
            {wallet?.isUnlimited
              ? "Akun whitelist dapat memproses video tanpa batas saldo."
              : `Estimasi sisa generate: ${wallet?.generateCreditsRemaining ?? 0} video.`}
          </p>
        </div>
        <span className="status status-success">Saldo aktif</span>
      </div>

      {wallet ? (
        <div className="deposit-layout">
          <div className="grid-form">
            <div className="section-card">
              <div className="row-head">
                <div>
                  <strong>Pilih paket saldo</strong>
                  <p className="small">Semua paket langsung menambah kredit ke akun yang sedang aktif.</p>
                </div>
                <WalletMinimal size={18} />
              </div>
            </div>

            <div className="deposit-package-grid">
              {wallet.packages.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`deposit-package ${getPackageAccent(item.code)} ${
                    item.code === selectedPackage?.code ? "active" : ""
                  }`}
                  onClick={() => setSelectedPackageCode(item.code)}
                >
                  <span className="small">{item.label}</span>
                  <strong>{formatRupiah(item.payAmountIdr)}</strong>
                  <span className="small">
                    Saldo {formatRupiah(item.creditAmountIdr)}
                    {item.bonusAmountIdr ? `, bonus ${formatRupiah(item.bonusAmountIdr)}` : ""}
                  </span>
                </button>
              ))}
            </div>

            {wallet.recentLedger.length ? (
              <div className="notice-box">
                <div className="row-head">
                  <strong>Riwayat saldo</strong>
                  <span className="small">{wallet.recentLedger.length} transaksi terakhir</span>
                </div>
                <ul className="summary-list">
                  {wallet.recentLedger.slice(0, 8).map((entry) => (
                    <li key={entry.id}>
                      {entry.description}: <strong>{formatRupiah(entry.amountIdr)}</strong> | saldo{" "}
                      {formatRupiah(entry.balanceAfterIdr)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="deposit-checkout">
            <div className="row-head">
              <div>
                <span className="eyebrow">Checkout QRIS</span>
                <h3>{selectedPackage?.label ?? "Paket saldo"}</h3>
                <p className="small">Kredit saldo {formatRupiah(selectedPackage?.creditAmountIdr)}.</p>
              </div>
              <button type="button" className="primary-button" onClick={onCreateTopup} disabled={creatingOrder}>
                <QrCode size={16} />
                <span>{creatingOrder ? "Menyiapkan QRIS..." : "Tampilkan QRIS"}</span>
              </button>
            </div>

            {activeOrder ? (
              <div className="deposit-invoice">
                <div className="deposit-qr-box">
                  {activeOrder.qrisPayload ? (
                    <QRCodeSVG value={activeOrder.qrisPayload} size={220} level="M" includeMargin />
                  ) : (
                    <p className="small">QRIS belum tersedia.</p>
                  )}
                </div>
                <div className="meta-grid">
                  <div className="meta-card">
                    <span className="small">Nominal Bayar</span>
                    <strong>{formatRupiah(activeOrder.totalAmountIdr ?? activeOrder.payAmountIdr)}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">Status</span>
                    <strong>{activeOrder.status}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">Expired</span>
                    <strong>{formatDateTime(activeOrder.expiredAt)}</strong>
                  </div>
                </div>
                <p className="small break-anywhere">No. invoice: {activeOrder.webqrisInvoiceId || activeOrder.id}</p>
                {activeOrder.status === "paid" ? (
                  <p className="ok-text">Pembayaran diterima. Saldo sudah ditambahkan.</p>
                ) : null}
              </div>
            ) : (
              <div className="notice-box">
                <div className="row-head">
                  <strong>Belum ada invoice aktif</strong>
                  <History size={16} />
                </div>
                <p className="section-note">
                  Pilih paket di kiri lalu tekan tombol QRIS untuk membuat invoice pembayaran baru.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
