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
import type { ContentLanguage } from "../types";
import { formatDateTime, formatIdrCurrency } from "../user-locale";
import { getUserCopy } from "../user-copy";

interface DepositPageProps {
  locale: ContentLanguage;
  onRefreshSession: () => Promise<void>;
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

export function DepositPage({ locale, onRefreshSession }: DepositPageProps) {
  const copy = getUserCopy(locale);
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
        <span className="eyebrow">{copy.deposit.eyebrow}</span>
        <h2>{copy.deposit.title}</h2>
        <p className="section-note">
          {copy.deposit.lead(formatIdrCurrency(wallet?.generatePriceIdr ?? 2000, locale))}
        </p>
      </div>

      <div className="quota-banner deposit-balance">
        <div>
          <strong>
            {loadingWallet
              ? copy.deposit.loadingBalance
              : wallet?.isUnlimited
                ? copy.deposit.unlimitedBalance
                : formatIdrCurrency(wallet?.walletBalanceIdr, locale)}
          </strong>
          <p className="small">
            {wallet?.isUnlimited
              ? copy.deposit.unlimitedNote
              : copy.deposit.remainingEstimate(wallet?.generateCreditsRemaining ?? 0)}
          </p>
        </div>
        <span className="status status-success">{copy.deposit.activeBalance}</span>
      </div>

      {wallet ? (
        <div className="deposit-layout">
          <div className="grid-form">
            <div className="section-card">
              <div className="row-head">
                <div>
                  <strong>{copy.deposit.selectPackage}</strong>
                  <p className="small">{copy.deposit.selectPackageLead}</p>
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
                  <strong>{formatIdrCurrency(item.payAmountIdr, locale)}</strong>
                  <span className="small">
                    {copy.deposit.creditPrefix} {formatIdrCurrency(item.creditAmountIdr, locale)}
                    {item.bonusAmountIdr
                      ? `, ${copy.deposit.bonusPrefix} ${formatIdrCurrency(item.bonusAmountIdr, locale)}`
                      : ""}
                  </span>
                </button>
              ))}
            </div>

            {wallet.recentLedger.length ? (
              <div className="notice-box">
                <div className="row-head">
                  <strong>{copy.deposit.balanceHistory}</strong>
                  <span className="small">{copy.deposit.latestTransactions(wallet.recentLedger.length)}</span>
                </div>
                <ul className="summary-list">
                  {wallet.recentLedger.slice(0, 8).map((entry) => (
                    <li key={entry.id}>
                      {entry.description}: <strong>{formatIdrCurrency(entry.amountIdr, locale)}</strong> | saldo{" "}
                      {formatIdrCurrency(entry.balanceAfterIdr, locale)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="deposit-checkout">
            <div className="row-head">
              <div>
                <span className="eyebrow">{copy.deposit.checkoutEyebrow}</span>
                <h3>{selectedPackage?.label ?? copy.deposit.defaultPackage}</h3>
                <p className="small">
                  {copy.deposit.checkoutLead(
                    formatIdrCurrency(selectedPackage?.creditAmountIdr, locale),
                    selectedPackage?.generateCredits ?? 0
                  )}
                </p>
              </div>
              <button type="button" className="primary-button" onClick={onCreateTopup} disabled={creatingOrder}>
                <QrCode size={16} />
                <span>{creatingOrder ? copy.deposit.preparingQris : copy.deposit.showQris}</span>
              </button>
            </div>

            {activeOrder ? (
              <div className="deposit-invoice">
                <div className="deposit-qr-box">
                  {activeOrder.qrisPayload ? (
                    <QRCodeSVG value={activeOrder.qrisPayload} size={220} level="M" includeMargin />
                  ) : (
                    <p className="small">{copy.deposit.qrisUnavailable}</p>
                  )}
                </div>
                <div className="meta-grid">
                  <div className="meta-card">
                    <span className="small">{copy.deposit.payAmount}</span>
                    <strong>{formatIdrCurrency(activeOrder.totalAmountIdr ?? activeOrder.payAmountIdr, locale)}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">{copy.deposit.status}</span>
                    <strong>{activeOrder.status}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="small">{copy.deposit.expired}</span>
                    <strong>{formatDateTime(activeOrder.expiredAt, locale)}</strong>
                  </div>
                </div>
                <p className="small break-anywhere">
                  {copy.deposit.invoiceNumber}: {activeOrder.webqrisInvoiceId || activeOrder.id}
                </p>
                {activeOrder.status === "paid" ? (
                  <p className="ok-text">{copy.deposit.paymentReceived}</p>
                ) : null}
              </div>
            ) : (
              <div className="notice-box">
                <div className="row-head">
                  <strong>{copy.deposit.noInvoice}</strong>
                  <History size={16} />
                </div>
                <p className="section-note">{copy.deposit.noInvoiceLead}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
