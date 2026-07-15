import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSettingsPage } from "./AdminSettingsPage";

const fetchSettingsMock = vi.fn();
const updateSettingsMock = vi.fn();

vi.mock("../api", () => ({
  fetchSettings: () => fetchSettingsMock(),
  updateSettings: (settings: unknown) => updateSettingsMock(settings)
}));

const settings = {
  scriptProvider: "aivene" as const,
  scriptFallbackProvider: "zai" as const,
  scriptModel: "qwen3.7-plus",
  taxRatePercent: 0,
  language: "id-ID" as const,
  maxVideoSeconds: 60,
  safetyMode: "safe_marketing" as const,
  concurrency: 1 as const,
  subscriptionPriceIdr: 20000,
  subscriptionDays: 30,
  qrisMerchantName: "VoiceShort",
  qrisImageUrl: "https://example.com/qris.png",
  qrisInstructions: "Bayar sesuai nominal unik."
};

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    fetchSettingsMock.mockReset().mockResolvedValue(settings);
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
