import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratePage } from "./pages/GeneratePage";
import type { AuthUser, GenerationSessionRecord } from "./types";
import * as api from "./api";

vi.mock("./api", () => ({
  createGenerationSession: vi.fn(),
  fetchGenerationSession: vi.fn(),
  fetchSession: vi.fn()
}));
vi.mock("./video-duration", () => ({ readVideoDuration: vi.fn(async () => 42) }));
vi.mock("./frame-extractor", () => ({
  extractFramesFromVideo: vi.fn(async () => [{
    index: 0, timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame",
    dataUrl: "data:image/jpeg;base64,frame", width: 448, height: 252
  }])
}));

const completedSession: GenerationSessionRecord = {
  sessionId: "session-1", createdAt: "2026-07-13T10:00:00Z", updatedAt: "2026-07-13T10:00:00Z",
  completedAt: "2026-07-13T10:00:01Z", title: "Produk", description: "Deskripsi produk",
  contentType: "affiliate", socialPlatform: "instagram", contentLanguage: "id-ID", tone: "natural",
  referenceLink: "https://example.com/produk", videoDurationSec: 42, frameCount: 1,
  status: "completed", chargedAmountIdr: 0,
  visualBrief: { summary: "Produk terlihat jelas", hook: { startSec: 0, endSec: 3, reason: "Hook" }, timeline: [], mustMention: [], mustAvoid: [], uncertainties: [] },
  sceneText: "Narator Indonesia, pace natural, akhiri tepat 42.00 detik.",
  sampleContextText: "Ikuti urutan visual tanpa intro atau outro tambahan.",
  scriptText: "Produk ini praktis digunakan setiap hari.",
  captionText: "Solusi praktis untuk rutinitas harian.", hashtags: ["#produk", "#praktis"]
};

const user: AuthUser = {
  id: "user-1", email: "user@test.dev", displayName: "User", role: "user",
  subscriptionStatus: "inactive", videoQuotaTotal: 0, videoQuotaUsed: 0,
  videoQuotaRemaining: 0, walletBalanceIdr: 0, generatePriceIdr: 1000,
  generateCreditsRemaining: 0, isUnlimited: false, assignedPackageCode: null,
  freeAnalysisLimit: 10, freeAnalysisUsed: 0, freeAnalysisRemaining: 10,
  subscriptionExpiresAt: null, hasAnalysisAccess: true
};

describe("analysis-only workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText: vi.fn(async () => undefined) }
    });
    vi.mocked(api.createGenerationSession).mockResolvedValue({ session: completedSession });
    vi.mocked(api.fetchSession).mockResolvedValue({ ...user, freeAnalysisUsed: 1, freeAnalysisRemaining: 9 });
  });

  it("shows every publishing output immediately after analysis", async () => {
    const { container } = render(<GeneratePage locale="id-ID" user={user} onViewJobs={vi.fn()} onSubscribe={vi.fn()} onUserUpdated={vi.fn()} />);
    const video = new File(["video"], "source.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/*"]')!, { target: { files: [video] } });
    fireEvent.change(screen.getByLabelText("Judul"), { target: { value: "Produk" } });
    fireEvent.change(screen.getByLabelText("Deskripsi"), { target: { value: "Deskripsi produk" } });
    await waitFor(() => expect(screen.getByText("42 detik")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Buat Naskah Voiceover" }));

    await screen.findByText(completedSession.sceneText);
    expect(screen.getByText(completedSession.sampleContextText)).toBeTruthy();
    expect(screen.getByText(completedSession.scriptText)).toBeTruthy();
    expect(screen.getByText(completedSession.captionText)).toBeTruthy();
    expect(screen.getByText("#produk #praktis")).toBeTruthy();
    expect(screen.getByText(completedSession.referenceLink!)).toBeTruthy();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
  });

  it("loads a completed analysis from history", async () => {
    vi.mocked(api.fetchGenerationSession).mockResolvedValue(completedSession);
    render(<GeneratePage locale="id-ID" user={user} onViewJobs={vi.fn()} onSubscribe={vi.fn()} onUserUpdated={vi.fn()} resumeSessionId="session-1" />);
    expect(await screen.findByText(completedSession.captionText)).toBeTruthy();
  });
});
