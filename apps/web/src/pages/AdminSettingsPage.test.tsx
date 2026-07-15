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
  concurrency: 1 as const
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
    expect(window.alert).toHaveBeenCalledWith("Pengaturan model AI berhasil disimpan.");
    expect(screen.getAllByText(/GLM-5V Turbo/)).toHaveLength(2);
  });
});
