import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratePage } from "./pages/GeneratePage";
import type { GenerationSessionRecord } from "./types";
import * as api from "./api";

vi.mock("./api", () => ({
  createGenerationSession: vi.fn(),
  fetchGenerationSession: vi.fn(),
  completeGenerationSession: vi.fn(),
  failGenerationSession: vi.fn()
}));
vi.mock("./video-duration", () => ({ readVideoDuration: vi.fn(async () => 42) }));
vi.mock("./media-utils", () => ({ readBlobDuration: vi.fn(async () => 41.8) }));
vi.mock("./frame-extractor", () => ({
  extractFramesFromVideo: vi.fn(async () => [{
    index: 0, timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame",
    dataUrl: "data:image/jpeg;base64,frame", width: 448, height: 252
  }])
}));
vi.mock("./local-render", () => ({
  renderFinalVideoLocally: vi.fn(async () => new Blob(["video"], { type: "video/mp4" }))
}));
vi.mock("./generation-cache", () => {
  let cache: Record<string, unknown> | undefined;
  return {
    getCachedSessionAssets: vi.fn(async () => cache),
    upsertCachedSessionAssets: vi.fn(async (value: Record<string, unknown>) => { cache = value; })
  };
});

const readySession: GenerationSessionRecord = {
  sessionId: "session-1", createdAt: "2026-07-13T10:00:00Z", updatedAt: "2026-07-13T10:00:00Z",
  title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
  socialPlatform: "instagram", contentLanguage: "id-ID", tone: "natural",
  referenceLink: "https://example.com/produk", videoDurationSec: 42, frameCount: 1,
  status: "ready_for_voice_upload", chargedAmountIdr: 0,
  visualBrief: { summary: "Produk terlihat jelas", hook: { startSec: 0, endSec: 3, reason: "Hook" }, timeline: [], mustMention: [], mustAvoid: [], uncertainties: [] },
  sceneText: "Narator Indonesia, pace natural, akhiri tepat 42.00 detik.",
  sampleContextText: "Ikuti urutan visual tanpa intro atau outro tambahan.",
  scriptText: "Produk ini praktis digunakan setiap hari.",
  captionText: "Solusi praktis untuk rutinitas harian.", hashtags: ["#produk", "#praktis"]
};

describe("personal voice upload workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText: vi.fn(async () => undefined) }
    });
    vi.mocked(api.createGenerationSession).mockResolvedValue({ session: readySession });
    vi.mocked(api.completeGenerationSession).mockResolvedValue({ ...readySession, status: "completed" });
    vi.mocked(api.failGenerationSession).mockResolvedValue(readySession);
  });

  it("analyzes, accepts uploaded voice, and reveals publishing text only after merge", async () => {
    const { container } = render(<GeneratePage locale="id-ID" onViewJobs={vi.fn()} />);
    expect(screen.queryByText(/gender suara/i)).toBeNull();
    expect(screen.queryByText(/script manual/i)).toBeNull();
    expect(screen.queryByText(/^subtitle$/i)).toBeNull();

    const video = new File(["video"], "source.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/*"]')!, { target: { files: [video] } });
    fireEvent.change(screen.getByLabelText("Judul"), { target: { value: "Produk" } });
    fireEvent.change(screen.getByLabelText("Deskripsi"), { target: { value: "Deskripsi produk" } });
    await waitFor(() => expect(screen.getByText("42 detik")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Analisa Video" }));

    await screen.findByText(readySession.sceneText);
    expect(screen.getByText(readySession.sampleContextText)).toBeTruthy();
    expect(screen.getByText(readySession.scriptText)).toBeTruthy();
    expect(screen.queryByText(readySession.captionText)).toBeNull();

    const voice = new File(["voice"], "voice.mp3", { type: "audio/mpeg" });
    fireEvent.change(container.querySelector('input[type="file"][accept^=".wav"]')!, { target: { files: [voice] } });
    await waitFor(() => expect(screen.getByText(/41\.80 detik voice/)).toBeTruthy());
    expect(screen.getByText(/Tempo voice sudah sesuai/)).toBeTruthy();
    expect(screen.getByText(/tanpa memotong kata/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gabungkan Voice dengan Video" }));

    await screen.findByText(readySession.captionText);
    expect(screen.getByText("#produk #praktis")).toBeTruthy();
    expect(screen.getByText(readySession.referenceLink!)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download MP4" })).toBeTruthy();
  });

  it("rejects voice files over 25 MB", async () => {
    vi.mocked(api.fetchGenerationSession).mockResolvedValue(readySession);
    const { container } = render(<GeneratePage locale="id-ID" onViewJobs={vi.fn()} resumeSessionId="session-1" />);
    await screen.findByText(readySession.sceneText);
    const large = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.wav", { type: "audio/wav" });
    fireEvent.change(container.querySelector('input[type="file"][accept^=".wav"]')!, { target: { files: [large] } });
    expect(await screen.findByText("Ukuran voice maksimal 25 MB.")).toBeTruthy();
  });
});
