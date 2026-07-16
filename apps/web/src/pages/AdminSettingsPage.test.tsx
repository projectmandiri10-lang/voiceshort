import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSettingsPage } from "./AdminSettingsPage";

const fetchSettingsMock = vi.fn();
const fetchTopupConfigMock = vi.fn();
const setQrisPaymentWindowModeMock = vi.fn();
const updateSettingsMock = vi.fn();

vi.mock("../api", () => ({
  fetchSettings: () => fetchSettingsMock(),
  fetchTopupConfig: () => fetchTopupConfigMock(),
  setQrisPaymentWindowMode: (mode: unknown) => setQrisPaymentWindowModeMock(mode),
  updateSettings: (settings: unknown) => updateSettingsMock(settings)
}));

const settings = {
  scriptProvider: "aivene" as const,
  scriptFallbackProvider: "zai" as const,
  scriptModel: "gpt-5.4-nano",
  taxRatePercent: 0,
  language: "id-ID" as const,
  maxVideoSeconds: 60,
  safetyMode: "safe_marketing" as const,
  concurrency: 1 as const,
  subscriptionPriceIdr: 20000,
  subscriptionDays: 30,
  qrisMerchantName: "VoiceShort",
  qrisImageUrl: "https://example.com/qris.png",
  qrisInstructions: "Bayar sesuai nominal unik.",
  qrisManualOverride: "auto" as const,
  qrisManualOverrideUntil: null
};

const topupConfig = {
  merchantName: "VoiceShort",
  qrisImageUrl: "https://example.com/qris.png",
  instructions: "Bayar sesuai nominal unik.",
  uniqueDigits: 2 as const,
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
    mode: "automatic" as const,
    manualOverrideState: null,
    manualOverrideUntil: null
  }
};

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    fetchSettingsMock.mockReset().mockResolvedValue(settings);
    fetchTopupConfigMock.mockReset().mockResolvedValue(topupConfig);
    setQrisPaymentWindowModeMock.mockReset().mockResolvedValue(settings);
    updateSettingsMock.mockReset().mockImplementation(async (value) => value);
    vi.stubGlobal("alert", vi.fn());
  });

  it("saves the selected Aivene model and confirms it with an alert", async () => {
    render(<AdminSettingsPage />);

    const select = await screen.findByLabelText("Model utama");
    fireEvent.change(select, { target: { value: "qwen3.5-flash" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan pengaturan" }));

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalledWith({
      ...settings,
      scriptModel: "qwen3.5-flash"
    }));
    expect(window.alert).toHaveBeenCalledWith("Pengaturan AI dan top up berhasil disimpan.");
    expect(screen.getByText(/Fallback superadmin:/)).toBeTruthy();
    expect(screen.getByText(/User gratis & top up:/)).toBeTruthy();
    expect(screen.getByText(/tanpa Z\.AI direct/)).toBeTruthy();
    expect(screen.getByText(/Top up QRIS statis/)).toBeTruthy();
  });

  it("lets the admin open QRIS manually and confirms it with an alert", async () => {
    render(<AdminSettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Buka manual" }));

    await waitFor(() => expect(setQrisPaymentWindowModeMock).toHaveBeenCalledWith("open"));
    expect(window.alert).toHaveBeenCalledWith("QRIS dibuka manual sampai pergantian jadwal otomatis berikutnya.");
  });

  it("offers the preconfigured MacroDroid export without embedding the secret", async () => {
    render(<AdminSettingsPage />);

    const download = await screen.findByRole("link", { name: "Download MacroDroid" });

    expect(download.getAttribute("href")).toBe("/downloads/voiceshort-interactive-qris.macro");
    expect(download.getAttribute("download")).toBe("voiceshort-interactive-qris.macro");
    expect(screen.getByText(/com\.interactive\.qrisid/)).toBeTruthy();
    expect(screen.getByText(/VOICESHORT_QRIS_SECRET/)).toBeTruthy();
    expect(screen.getByText(/INTERACTIVE_QRIS_WEBHOOK_SECRET/)).toBeTruthy();
  });
});
