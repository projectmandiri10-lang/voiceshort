import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPage } from "./SubscriptionPage";
import type { AuthUser, PaymentOrder, TopupConfig, WalletSummary } from "../types";

const {
  createTopupMock,
  fetchSessionMock,
  fetchTopupConfigMock,
  fetchTopupStatusMock,
  fetchWalletMock,
  removeChannelMock,
  subscribeMock,
  channelOnMock,
  realtimeState
} = vi.hoisted(() => ({
  createTopupMock: vi.fn(),
  fetchSessionMock: vi.fn(),
  fetchTopupConfigMock: vi.fn(),
  fetchTopupStatusMock: vi.fn(),
  fetchWalletMock: vi.fn(),
  removeChannelMock: vi.fn(async () => undefined),
  subscribeMock: vi.fn(),
  channelOnMock: vi.fn(),
  realtimeState: { callback: null as null | (() => void) }
}));

vi.mock("../api", () => ({
  createTopup: (packageCode: string) => createTopupMock(packageCode),
  fetchSession: () => fetchSessionMock(),
  fetchTopupConfig: () => fetchTopupConfigMock(),
  fetchTopupStatus: (orderId: string) => fetchTopupStatusMock(orderId),
  fetchWallet: () => fetchWalletMock()
}));

vi.mock("../supabase", () => ({
  supabase: {
    channel: () => ({
      on: (_event: string, _filter: unknown, callback: () => void) => {
        realtimeState.callback = callback;
        channelOnMock();
        return {
          subscribe: () => {
            subscribeMock();
            return { unsubscribe: vi.fn() };
          }
        };
      }
    }),
    removeChannel: removeChannelMock
  }
}));

const config: TopupConfig = {
  merchantName: "Megakomindo",
  qrisImageUrl: "/qris/megakomindo-qris.jpg",
  instructions: "Bayar sesuai nominal unik.",
  uniqueDigits: 2,
  uniqueCodeMin: 71,
  uniqueCodeMax: 99,
  webhookConfigured: true,
  paymentWindow: {
    timeZone: "Asia/Jakarta",
    opensAt: "05:00",
    closesAt: "22:00",
    isOpen: true,
    nextOpenAt: null,
    nextAutomaticAt: "2026-07-15T15:00:00.000Z",
    mode: "automatic",
    manualOverrideState: null,
    manualOverrideUntil: null
  }
};

const wallet: WalletSummary = {
  walletBalanceIdr: 0,
  generatePriceIdr: 2000,
  generateCreditsRemaining: 0,
  isUnlimited: false,
  packages: [
    {
      code: "1_video",
      label: "1 generate",
      payAmountIdr: 2000,
      creditAmountIdr: 2000,
      bonusAmountIdr: 0,
      generateCredits: 1
    },
    {
      code: "10_video",
      label: "10 generate",
      payAmountIdr: 20000,
      creditAmountIdr: 20000,
      bonusAmountIdr: 0,
      generateCredits: 10
    }
  ],
  recentLedger: [],
  recentTopups: []
};

const pendingOrder: PaymentOrder = {
  id: "order-1",
  packageCode: "1_video",
  provider: "interactive_qris",
  payAmountIdr: 2000,
  creditAmountIdr: 2000,
  taxRatePercent: 0,
  taxAmountIdr: 0,
  netAmountIdr: 2000,
  merchantOrderId: "VSQRIS-1",
  webqrisInvoiceId: null,
  qrisPayload: null,
  uniqueCode: 71,
  totalAmountIdr: 2071,
  status: "pending",
  expiredAt: "2099-07-15T15:00:00Z",
  paidAt: null,
  paymentMethod: null
};

const paidOrder: PaymentOrder = {
  ...pendingOrder,
  status: "paid",
  paidAt: "2099-07-15T14:10:00Z",
  paymentMethod: "interactive_qris"
};

const user: AuthUser = {
  id: "user-1",
  email: "user@test.dev",
  displayName: "User",
  role: "user",
  subscriptionStatus: "inactive",
  videoQuotaTotal: 0,
  videoQuotaUsed: 0,
  videoQuotaRemaining: 0,
  walletBalanceIdr: 0,
  generatePriceIdr: 2000,
  generateCreditsRemaining: 0,
  isUnlimited: false,
  assignedPackageCode: null,
  freeAnalysisLimit: 10,
  freeAnalysisUsed: 10,
  freeAnalysisRemaining: 0,
  subscriptionExpiresAt: null,
  hasAnalysisAccess: false
};

describe("SubscriptionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeState.callback = null;
    fetchTopupConfigMock.mockResolvedValue(config);
    fetchWalletMock
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce({ ...wallet, walletBalanceIdr: 2000, generateCreditsRemaining: 1 })
      .mockResolvedValue({ ...wallet, walletBalanceIdr: 2000, generateCreditsRemaining: 1 });
    createTopupMock.mockResolvedValue(pendingOrder);
    fetchTopupStatusMock.mockResolvedValue(paidOrder);
    fetchSessionMock.mockResolvedValue({
      ...user,
      walletBalanceIdr: 2000,
      generateCreditsRemaining: 1,
      hasAnalysisAccess: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows topup success in realtime and redirects automatically to Generate", async () => {
    const onGenerate = vi.fn();
    const onUserUpdated = vi.fn();

    render(<SubscriptionPage user={user} onUserUpdated={onUserUpdated} onGenerate={onGenerate} />);

    await screen.findByRole("button", { name: "Buat Invoice Top Up" });
    fireEvent.click(screen.getByRole("button", { name: "Buat Invoice Top Up" }));

    await screen.findByText("Bayar tepat sebesar");
    expect(createTopupMock).toHaveBeenCalledWith("1_video");
    expect(channelOnMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    await act(async () => {
      realtimeState.callback?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchTopupStatusMock).toHaveBeenCalledWith("order-1");
    expect(screen.getByText(/Pembayaran berhasil diverifikasi/)).toBeTruthy();
    expect(onUserUpdated).toHaveBeenCalledWith(expect.objectContaining({
      walletBalanceIdr: 2000,
      hasAnalysisAccess: true
    }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});
