import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as adminUsersExport from "./admin-users-export";
import { DepositPage } from "./pages/DepositPage";
import { GeneratePage } from "./pages/GeneratePage";
import { JobsPage } from "./pages/JobsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AdminUserRecord, AuthUser, GenerationSessionRecord } from "./types";
import * as api from "./api";
import * as frameExtractor from "./frame-extractor";
import * as generationCache from "./generation-cache";
import * as localRender from "./local-render";
import * as videoDuration from "./video-duration";

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    value: language,
    configurable: true
  });
}

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    completeGoogleOAuthRedirect: vi.fn(),
    completeGenerationSession: vi.fn(),
    createAdminUser: vi.fn(),
    createGenerationSession: vi.fn(),
    createTopup: vi.fn(),
    disableAdminUser: vi.fn(),
    fetchAdminTransactions: vi.fn(),
    failGenerationSession: vi.fn(),
    fetchAdminUsers: vi.fn(),
    fetchGenerationSession: vi.fn(),
    fetchGenerationSessionAudio: vi.fn(),
    fetchGenerationSessions: vi.fn(),
    fetchSession: vi.fn(),
    fetchSettings: vi.fn(),
    fetchTopupStatus: vi.fn(),
    fetchTtsVoices: vi.fn(),
    fetchWallet: vi.fn(),
    grantAdminUserPackage: vi.fn(),
    isAuthReady: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    previewTtsVoice: vi.fn(),
    register: vi.fn(),
    startGoogleLogin: vi.fn(),
    subscribeToAuthState: vi.fn(() => () => undefined),
    updateAdminUser: vi.fn(),
    updateSettings: vi.fn()
  };
});

vi.mock("./video-duration", () => ({
  readVideoDuration: vi.fn(async () => 42)
}));

vi.mock("./frame-extractor", () => ({
  extractFramesFromVideo: vi.fn(async () => [
    {
      index: 0,
      timestampSec: 0,
      mimeType: "image/jpeg",
      base64Data: "frame-1",
      dataUrl: "data:image/jpeg;base64,frame-1",
      width: 448,
      height: 252
    },
    {
      index: 1,
      timestampSec: 21,
      mimeType: "image/jpeg",
      base64Data: "frame-2",
      dataUrl: "data:image/jpeg;base64,frame-2",
      width: 448,
      height: 252
    }
  ])
}));

vi.mock("./local-render", () => ({
  buildFinalMuxArgs: vi.fn(),
  renderFinalVideoLocally: vi.fn(async () => new Blob(["video"], { type: "video/mp4" }))
}));

vi.mock("./generation-cache", () => ({
  getCachedSessionAssets: vi.fn(async () => undefined),
  listCachedSessionIds: vi.fn(async () => []),
  upsertCachedSessionAssets: vi.fn(async () => undefined)
}));

vi.mock("./admin-users-export", () => ({
  exportAdminUsersWorkbook: vi.fn()
}));

const activeUser: AuthUser = {
  id: "user-creator",
  email: "creator@test.dev",
  displayName: "Creator",
  role: "user",
  subscriptionStatus: "active",
  videoQuotaTotal: 10,
  videoQuotaUsed: 2,
  videoQuotaRemaining: 8,
  walletBalanceIdr: 16_000,
  generatePriceIdr: 2_000,
  generateCreditsRemaining: 8,
  isUnlimited: false,
  disabledAt: null,
  disabledReason: null,
  assignedPackageCode: null
};

const adminUser: AuthUser = {
  id: "user-admin",
  email: "jho.j80@gmail.com",
  displayName: "Jho",
  role: "superadmin",
  subscriptionStatus: "active",
  videoQuotaTotal: 1000,
  videoQuotaUsed: 0,
  videoQuotaRemaining: 1000,
  walletBalanceIdr: 2_000_000,
  generatePriceIdr: 2_000,
  generateCreditsRemaining: null,
  isUnlimited: true,
  disabledAt: null,
  disabledReason: null,
  assignedPackageCode: null
};

const managedAdminUsers: AdminUserRecord[] = [
  {
    id: "user-bunga",
    email: "bunga.makassar17@gmail.com",
    displayName: "Bunga Indah",
    role: "user",
    subscriptionStatus: "inactive",
    videoQuotaTotal: 10,
    videoQuotaUsed: 10,
    videoQuotaRemaining: 0,
    walletBalanceIdr: 0,
    generatePriceIdr: 2_000,
    generateCreditsRemaining: 0,
    isUnlimited: false,
    disabledAt: "2026-07-02T09:00:00.000Z",
    disabledReason: "Dinonaktifkan oleh admin",
    assignedPackageCode: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
    googleLinked: true,
    hasPassword: false
  },
  {
    id: "user-raka",
    email: "raka.saleh@gmail.com",
    displayName: "Raka Saleh",
    role: "user",
    subscriptionStatus: "active",
    videoQuotaTotal: 25,
    videoQuotaUsed: 5,
    videoQuotaRemaining: 20,
    walletBalanceIdr: 10_000,
    generatePriceIdr: 2_000,
    generateCreditsRemaining: 5,
    isUnlimited: false,
    disabledAt: null,
    disabledReason: null,
    assignedPackageCode: "10_video",
    createdAt: "2026-06-15T09:00:00.000Z",
    updatedAt: "2026-07-03T08:30:00.000Z",
    googleLinked: false,
    hasPassword: true
  },
  {
    id: "user-jho",
    email: "jho.j80@gmail.com",
    displayName: "jho.j80",
    role: "superadmin",
    subscriptionStatus: "active",
    videoQuotaTotal: 1000,
    videoQuotaUsed: 0,
    videoQuotaRemaining: 1000,
    walletBalanceIdr: 2_000_000,
    generatePriceIdr: 2_000,
    generateCreditsRemaining: null,
    isUnlimited: true,
    disabledAt: null,
    disabledReason: null,
    assignedPackageCode: null,
    createdAt: "2026-05-01T09:00:00.000Z",
    updatedAt: "2026-07-03T10:00:00.000Z",
    googleLinked: true,
    hasPassword: true
  }
];

const mockSettings = {
  scriptProvider: "aivene" as const,
  scriptFallbackProvider: "openrouter" as const,
  scriptModel: "gemini-2.5-flash",
  ttsProvider: "openrouter" as const,
  ttsFallbackProvider: "aivene" as const,
  ttsModel: "google/gemini-3.1-flash-tts-preview",
  taxRatePercent: 0,
  language: "id-ID" as const,
  maxVideoSeconds: 60,
  safetyMode: "safe_marketing" as const,
  concurrency: 1 as const,
  genderVoices: [
    {
      gender: "male" as const,
      voiceName: "Charon",
      speechRate: 1
    },
    {
      gender: "female" as const,
      voiceName: "Leda",
      speechRate: 1
    }
  ]
};

const mockVoices = {
  voices: [
    {
      provider: "openrouter" as const,
      voiceName: "Leda",
      label: "Leda",
      tone: "Youthful",
      gender: "female" as const
    },
    {
      provider: "openrouter" as const,
      voiceName: "Charon",
      label: "Charon",
      tone: "Informative",
      gender: "male" as const
    }
  ],
  excitedPresets: []
};

function buildSession(
  overrides: Partial<GenerationSessionRecord> = {}
): GenerationSessionRecord {
  return {
    sessionId: "session-1",
    createdAt: "2026-05-28T08:00:00.000Z",
    updatedAt: "2026-05-28T08:05:00.000Z",
    completedAt: null,
    ownerEmail: activeUser.email,
    title: "Voice Over Produk",
    description: "Jelaskan produk dengan singkat dan menarik",
    contentType: "affiliate",
    socialPlatform: "instagram",
    contentLanguage: "id-ID",
    scriptMode: "auto_analysis",
    includeSubtitles: false,
    voiceGender: "female",
    tone: "natural",
    ctaText: "cek detailnya sekarang",
    referenceLink: "https://contoh.test/ref",
    videoDurationSec: 42,
    frameCount: 12,
    status: "ready_for_render",
    scriptText: "Ini contoh naskah voice over yang siap dipakai.",
    captionText: "Caption singkat untuk posting.",
    hashtags: ["#produk", "#affiliate"],
    voiceName: "Leda",
    speechRate: 1,
    chargedAmountIdr: 2_000,
    errorMessage: undefined,
    renderSummary: undefined,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
  setNavigatorLanguage("id-ID");
  vi.mocked(api.completeGoogleOAuthRedirect).mockResolvedValue({ sessionReady: false });
  vi.mocked(api.fetchSession).mockResolvedValue(null);
  vi.mocked(api.fetchSettings).mockResolvedValue(mockSettings);
  vi.mocked(api.fetchTtsVoices).mockResolvedValue(mockVoices);
  vi.mocked(api.updateSettings).mockResolvedValue(mockSettings);
  vi.mocked(api.isAuthReady).mockReturnValue(true);
  vi.mocked(api.startGoogleLogin).mockResolvedValue(undefined);
  vi.mocked(api.fetchWallet).mockResolvedValue({
    walletBalanceIdr: activeUser.walletBalanceIdr,
    generatePriceIdr: activeUser.generatePriceIdr,
    generateCreditsRemaining: activeUser.generateCreditsRemaining,
    isUnlimited: activeUser.isUnlimited,
    packages: [
      {
        code: "10_video",
        label: "10 generate",
        payAmountIdr: 20_000,
        creditAmountIdr: 20_000,
        bonusAmountIdr: 0,
        generateCredits: 10
      }
    ],
    recentLedger: [],
    recentTopups: []
  });
  vi.mocked(api.fetchAdminTransactions).mockResolvedValue({
    items: [],
    nextCursor: null
  });
  vi.mocked(api.fetchGenerationSessions).mockResolvedValue([]);
  vi.mocked(api.fetchGenerationSession).mockResolvedValue(buildSession());
  vi.mocked(api.fetchGenerationSessionAudio).mockResolvedValue(
    new Blob(["audio"], { type: "audio/wav" })
  );
  vi.mocked(api.completeGenerationSession).mockResolvedValue(
    buildSession({
      status: "completed",
      completedAt: "2026-05-28T08:06:00.000Z",
      renderSummary: {
        finalDurationSec: 42,
        finalSizeBytes: 5242880,
        renderedAt: "2026-05-28T08:06:00.000Z",
        localFileName: "voice-over-produk-final.mp4"
      }
    })
  );
  vi.mocked(api.previewTtsVoice).mockResolvedValue({
    voiceName: "Charon",
    audioUrl: "blob:preview-audio"
  });
});

describe("web smoke", () => {
  it("renders landing page with the new hero and pricing copy", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /Bikin pengisi suara video short/i })
    ).toBeTruthy();
    expect(screen.getByText(/^Rp2\.000$/i, { selector: ".pricing-price" })).toBeTruthy();
    expect(
      screen.getByText(/Pengisi suara AI realistis/i, { selector: ".pricing-card strong" })
    ).toBeTruthy();
  });

  it("starts Google OAuth from landing page", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: /Bikin pengisi suara video short/i });
    fireEvent.click(screen.getByRole("button", { name: /Masuk dengan Google/i }));

    await waitFor(() => {
      expect(api.startGoogleLogin).toHaveBeenCalledWith("/?view=generate");
    });
  });

  it("logs in with email and opens the dashboard", async () => {
    vi.mocked(api.login).mockResolvedValue({
      user: activeUser,
      message: "Berhasil masuk. Selamat datang kembali."
    });

    render(<App />);

    await screen.findByRole("heading", { name: /Bikin pengisi suara video short/i });
    fireEvent.change(screen.getByLabelText(/^Email$/i), {
      target: { value: activeUser.email }
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: "password-rahasia" }
    });
    const submitButtons = screen.getAllByRole("button", { name: /^Masuk$/i });
    fireEvent.click(submitButtons[submitButtons.length - 1]!);

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: activeUser.email,
        password: "password-rahasia"
      });
    });
    expect(await screen.findByText(/^Creator$/i)).toBeTruthy();
  });

  it("renders the local generate workspace", async () => {
    render(
      <GeneratePage
        locale="id-ID"
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(generationCache.listCachedSessionIds).toHaveBeenCalled();
    });
    expect(screen.getByRole("region", { name: /^slot video 1$/i })).toBeTruthy();
    expect(screen.getByText(/Video Utama/i)).toBeTruthy();
    expect((screen.getByLabelText(/^Mode Generate/i) as HTMLSelectElement).value).toBe(
      "auto_analysis"
    );
    expect((screen.getByLabelText(/^Subtitle Video/i) as HTMLSelectElement).value).toBe(
      "without_subtitles"
    );
    expect(screen.getByLabelText(/^Judul/i)).toBeTruthy();
    expect(screen.getAllByText(/Flat per proses/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Proses Video/i })).toBeTruthy();
  });

  it("submits one local render flow end-to-end", async () => {
    const createdSession = buildSession({
      sessionId: "session-101",
      status: "ready_for_audio"
    });
    const onRefreshSession = vi.fn(async () => undefined);
    vi.mocked(api.createGenerationSession).mockResolvedValue({
      session: createdSession
    });
    vi.mocked(generationCache.listCachedSessionIds).mockResolvedValue([]);

    render(
      <GeneratePage
        locale="id-ID"
        currentUser={activeUser}
        onRefreshSession={onRefreshSession}
        onViewJobs={vi.fn()}
      />
    );

    const file = new File(["video-one"], "source.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText(/^Video/i), {
      target: { files: [file] }
    });
    await waitFor(() => {
      expect(videoDuration.readVideoDuration).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(screen.getByLabelText(/^Judul/i), {
      target: { value: "Voice Over Produk" }
    });
    fireEvent.change(screen.getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Jelaskan produk dengan singkat dan menarik" }
    });

    fireEvent.click(screen.getByRole("button", { name: /Proses Video/i }));

    await waitFor(() => {
      expect(frameExtractor.extractFramesFromVideo).toHaveBeenCalledTimes(1);
      expect(api.createGenerationSession).toHaveBeenCalledTimes(1);
      expect(api.fetchGenerationSessionAudio).toHaveBeenCalledWith("session-101");
      expect(localRender.renderFinalVideoLocally).toHaveBeenCalledTimes(1);
      expect(api.completeGenerationSession).toHaveBeenCalledTimes(1);
    });
    expect(api.createGenerationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        includeSubtitles: false
      })
    );
    expect(await screen.findByRole("heading", { name: /^Final video siap$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unduh Final MP4/i })).toBeTruthy();
    expect(onRefreshSession).toHaveBeenCalled();
  });

  it("allows generating with burned subtitles when enabled in the form", async () => {
    const createdSession = buildSession({
      sessionId: "session-subtitle-1",
      includeSubtitles: true,
      status: "ready_for_audio"
    });
    vi.mocked(api.createGenerationSession).mockResolvedValue({
      session: createdSession
    });
    vi.mocked(generationCache.listCachedSessionIds).mockResolvedValue([]);

    render(
      <GeneratePage
        locale="id-ID"
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    const file = new File(["video-subtitle"], "subtitle.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText(/^Video/i), {
      target: { files: [file] }
    });
    await waitFor(() => {
      expect(videoDuration.readVideoDuration).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText(/^Judul/i), {
      target: { value: "Voice Over Subtitle" }
    });
    fireEvent.change(screen.getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Narasi untuk video dengan subtitle aktif." }
    });
    fireEvent.change(screen.getByLabelText(/^Subtitle Video/i), {
      target: { value: "with_subtitles" }
    });

    fireEvent.click(screen.getByRole("button", { name: /Proses Video/i }));

    await waitFor(() => {
      expect(api.createGenerationSession).toHaveBeenCalledWith(
        expect.objectContaining({
          includeSubtitles: true
        })
      );
      expect(localRender.renderFinalVideoLocally).toHaveBeenCalledWith(
        expect.objectContaining({
          subtitleText: createdSession.scriptText
        })
      );
    });
  });

  it("submits manual script mode without frame extraction", async () => {
    const createdSession = buildSession({
      sessionId: "session-manual-1",
      scriptMode: "manual_script",
      frameCount: 0,
      status: "ready_for_audio",
      description: ""
    });
    vi.mocked(api.createGenerationSession).mockResolvedValue({
      session: createdSession
    });

    render(
      <GeneratePage
        locale="id-ID"
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    const file = new File(["video-manual"], "manual.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText(/^Video/i), {
      target: { files: [file] }
    });
    await waitFor(() => {
      expect(videoDuration.readVideoDuration).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText(/^Mode Generate/i), {
      target: { value: "manual_script" }
    });

    expect(await screen.findByLabelText(/Script Video Manual/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Brief \/ Deskripsi/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Judul/i), {
      target: { value: "Voice Over Manual" }
    });
    fireEvent.change(screen.getByLabelText(/Script Video Manual/i), {
      target: { value: "Ini script manual final yang dipakai langsung." }
    });

    fireEvent.click(screen.getByRole("button", { name: /Proses Video/i }));

    await waitFor(() => {
      expect(frameExtractor.extractFramesFromVideo).not.toHaveBeenCalled();
      expect(api.createGenerationSession).toHaveBeenCalledWith(
        expect.objectContaining({
          contentLanguage: "id-ID",
          scriptMode: "manual_script",
          manualScriptText: "Ini script manual final yang dipakai langsung.",
          frames: []
        })
      );
    });
  });

  it("renders deposit page with per-generate package copy", async () => {
    render(<DepositPage locale="id-ID" onRefreshSession={vi.fn(async () => undefined)} />);

    expect(await screen.findByRole("heading", { name: /Isi saldo lewat QRIS/i })).toBeTruthy();
    expect(screen.getAllByText(/10 generate/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/flat per generate/i)).toBeTruthy();
  });

  it("renders jobs history using generation sessions and local cache indicators", async () => {
    vi.mocked(api.fetchGenerationSessions).mockResolvedValue([
      buildSession({
        status: "completed",
        completedAt: "2026-05-28T08:06:00.000Z",
        renderSummary: {
          finalDurationSec: 42,
          finalSizeBytes: 5242880,
          renderedAt: "2026-05-28T08:06:00.000Z",
          localFileName: "voice-over-produk-final.mp4"
        }
      })
    ]);
    vi.mocked(generationCache.listCachedSessionIds).mockResolvedValue(["session-1"]);
    vi.mocked(generationCache.getCachedSessionAssets).mockResolvedValue({
      sessionId: "session-1",
      sourceVideoBlob: new Blob(["video"], { type: "video/mp4" }),
      sourceVideoName: "source.mp4",
      sourceVideoType: "video/mp4",
      audioBlob: new Blob(["audio"], { type: "audio/wav" }),
      audioMimeType: "audio/wav",
      renderedVideoBlob: new Blob(["rendered"], { type: "video/mp4" }),
      renderFileName: "voice-over-produk-final.mp4",
      updatedAt: "2026-05-28T08:06:00.000Z"
    });

    render(
      <JobsPage
        locale="id-ID"
        currentUser={activeUser}
        selectedJobId="session-1"
        onSelectJob={vi.fn()}
        onResumeSession={vi.fn()}
      />
    );

    expect(await screen.findByRole("heading", { name: /Detail Generate/i })).toBeTruthy();
    expect(screen.getByText(/Draft lokal tersedia/i)).toBeTruthy();
    expect(screen.getAllByText(/Analisa Otomatis/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Buka di Workspace Generate/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unduh Final/i })).toBeTruthy();
  });

  it("uses object url previews for voice settings", async () => {
    render(<SettingsPage />);

    expect(await screen.findByRole("heading", { name: /Pengaturan Layanan/i })).toBeTruthy();
    expect(screen.getAllByRole("option", { name: /Aivene/i }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Preview Suara/i })[0]!);

    await waitFor(() => {
      expect(api.previewTtsVoice).toHaveBeenCalledTimes(1);
    });

    const audio = document.querySelector("audio.audio-preview") as HTMLAudioElement | null;
    expect(audio).toBeTruthy();
    expect(audio?.src).toContain("blob:preview-audio");
  });

  it("renders English user flows while keeping settings page in Indonesian", async () => {
    setNavigatorLanguage("en-US");
    vi.mocked(api.fetchGenerationSessions).mockResolvedValue([
      buildSession({
        contentLanguage: "en-US",
        title: "English Session",
        description: "English flow"
      })
    ]);

    render(<App />);

    expect(
      await screen.findByRole("button", { name: /Continue with Google/i })
    ).toBeTruthy();

    render(
      <GeneratePage
        locale="en-US"
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );
    expect(await screen.findByText(/Main Video/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Process Video/i })).toBeTruthy();

    render(<DepositPage locale="en-US" onRefreshSession={vi.fn(async () => undefined)} />);
    expect(await screen.findByRole("heading", { name: /Top up your balance/i })).toBeTruthy();

    render(
      <JobsPage
        locale="en-US"
        currentUser={activeUser}
        selectedJobId="session-1"
        onSelectJob={vi.fn()}
        onResumeSession={vi.fn()}
      />
    );
    expect(await screen.findByRole("heading", { name: /Generate Details/i })).toBeTruthy();

    render(<SettingsPage />);
    expect(await screen.findByRole("heading", { name: /Pengaturan Layanan/i })).toBeTruthy();
    expect(screen.getByLabelText(/Pajak Transaksi/i)).toBeTruthy();
  });

  it("renders tax setting field for superadmin settings", async () => {
    render(<SettingsPage />);

    expect(await screen.findByRole("heading", { name: /Pengaturan Layanan/i })).toBeTruthy();
    expect(screen.getByLabelText(/Pajak Transaksi/i)).toBeTruthy();
  });

  it("renders admin navigation for superadmin", async () => {
    vi.mocked(api.fetchSession).mockResolvedValue(adminUser);
    vi.mocked(api.fetchGenerationSessions).mockResolvedValue([]);
    vi.mocked(api.fetchAdminUsers).mockResolvedValue(managedAdminUsers);
    vi.mocked(api.fetchAdminTransactions).mockResolvedValue({
      items: [
        {
          transactionId: "payment_order:1",
          kind: "payment",
          status: "paid",
          occurredAt: "2026-07-03T10:00:00.000Z",
          ownerUserId: "user-creator",
          ownerEmail: "creator@test.dev",
          grossAmountIdr: 20000,
          walletImpactIdr: 20000,
          balanceAfterIdr: 36000,
          taxRatePercent: 11,
          taxAmountIdr: 2200,
          netAmountIdr: 17800,
          entryType: "deposit_credit",
          sourceType: "payment_order",
          description: "Deposit WebQRIS berhasil",
          paymentMethod: "qris",
          merchantOrderId: "VS-123",
          invoiceId: "INV-123"
        }
      ],
      nextCursor: null
    });

    render(<App />);

    expect(await screen.findByText(/^Jho$/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Admin$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Admin$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Kelola user, akses, paket saldo, dan audit transaksi/i })
      ).toBeTruthy();
    });

    expect(screen.getByLabelText(/^Cari user$/i)).toBeTruthy();
    expect(screen.getByRole("listitem", { name: /Pilih user jho\.j80/i })).toBeTruthy();
    expect(screen.queryByText(/^Buat user baru$/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Transaksi$/i }));
    expect(await screen.findByText(/Deposit WebQRIS berhasil/i)).toBeTruthy();
  });

  it("filters, exports, and opens create mode for admin users", async () => {
    vi.mocked(api.fetchSession).mockResolvedValue(adminUser);
    vi.mocked(api.fetchGenerationSessions).mockResolvedValue([]);
    vi.mocked(api.fetchAdminUsers).mockResolvedValue(managedAdminUsers);

    render(<App />);

    expect(await screen.findByText(/^Jho$/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Admin$/i }));

    const listPanel = await screen.findByLabelText(/List user admin/i);
    fireEvent.change(within(listPanel).getByLabelText(/^Cari user$/i), {
      target: { value: "bunga" }
    });

    expect(screen.getByRole("listitem", { name: /Pilih user Bunga Indah/i })).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: /Pilih user jho\.j80/i })).toBeNull();

    fireEvent.click(within(listPanel).getByRole("button", { name: /Export Excel/i }));

    expect(adminUsersExport.exportAdminUsersWorkbook).toHaveBeenCalledWith({
      filteredUsers: [managedAdminUsers[0]],
      allUsers: managedAdminUsers
    });

    fireEvent.click(within(listPanel).getByRole("button", { name: /Reset Filter/i }));
    fireEvent.change(within(listPanel).getByLabelText(/Filter role/i), {
      target: { value: "superadmin" }
    });

    expect(screen.getByRole("listitem", { name: /Pilih user jho\.j80/i })).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: /Pilih user Bunga Indah/i })).toBeNull();

    fireEvent.click(within(listPanel).getByRole("button", { name: /Tambah User/i }));

    expect(await screen.findByText(/^Buat user baru$/i)).toBeTruthy();
    expect(screen.getByLabelText(/Password Awal/i)).toBeTruthy();
  });

  it("keeps save, disable, and grant actions wired to the existing admin APIs", async () => {
    const editableUser = managedAdminUsers[1]!;
    vi.mocked(api.fetchSession).mockResolvedValue(adminUser);
    vi.mocked(api.fetchGenerationSessions).mockResolvedValue([]);
    vi.mocked(api.fetchAdminUsers).mockResolvedValue(managedAdminUsers);
    vi.mocked(api.updateAdminUser).mockResolvedValue({
      ...editableUser,
      displayName: "Raka Final"
    });
    vi.mocked(api.disableAdminUser).mockResolvedValue({
      ...editableUser,
      disabledAt: "2026-07-04T08:00:00.000Z",
      disabledReason: "Dinonaktifkan oleh admin"
    });
    vi.mocked(api.grantAdminUserPackage).mockResolvedValue({
      ...editableUser,
      walletBalanceIdr: 20_000,
      generateCreditsRemaining: 10,
      assignedPackageCode: "10_video"
    });

    render(<App />);

    expect(await screen.findByText(/^Jho$/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Admin$/i }));
    fireEvent.click(await screen.findByRole("listitem", { name: /Pilih user Raka Saleh/i }));

    const detailPanel = await screen.findByLabelText(/Detail user admin/i);
    fireEvent.change(within(detailPanel).getByLabelText(/^Nama$/i), {
      target: { value: "Raka Final" }
    });
    fireEvent.click(within(detailPanel).getByRole("button", { name: /Simpan User/i }));

    await waitFor(() => {
      expect(api.updateAdminUser).toHaveBeenCalledWith(
        "raka.saleh@gmail.com",
        expect.objectContaining({
          displayName: "Raka Final"
        })
      );
    });

    fireEvent.click(within(detailPanel).getByRole("button", { name: /Nonaktifkan User/i }));

    await waitFor(() => {
      expect(api.disableAdminUser).toHaveBeenCalledWith("raka.saleh@gmail.com");
    });

    fireEvent.click(within(detailPanel).getByRole("button", { name: /Tambahkan Saldo/i }));

    await waitFor(() => {
      expect(api.grantAdminUserPackage).toHaveBeenCalledWith(
        "raka.saleh@gmail.com",
        expect.objectContaining({
          packageCode: "10_video"
        })
      );
    });
  });
});
