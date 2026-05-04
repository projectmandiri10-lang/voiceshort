import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { GeneratePage } from "./pages/GeneratePage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AuthUser, JobRecord } from "./types";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    completeGoogleOAuthRedirect: vi.fn(),
    createAdminUser: vi.fn(),
    createJob: vi.fn(),
    createTopup: vi.fn(),
    disableAdminUser: vi.fn(),
    deleteJob: vi.fn(),
    fetchAdminUsers: vi.fn(),
    fetchGenerationCapacity: vi.fn(),
    fetchJobDetail: vi.fn(),
    fetchJobs: vi.fn(),
    fetchSession: vi.fn(),
    fetchSettings: vi.fn(),
    fetchTopupStatus: vi.fn(),
    fetchTtsVoices: vi.fn(),
    fetchWallet: vi.fn(),
    grantAdminUserPackage: vi.fn(),
    isAuthReady: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    openJobOutputLocation: vi.fn(),
    previewTtsVoice: vi.fn(),
    register: vi.fn(),
    retryJob: vi.fn(),
    startGoogleLogin: vi.fn(),
    subscribeToAuthState: vi.fn(() => () => undefined),
    subscribeToJobEvents: vi.fn(() => vi.fn()),
    updateAdminUser: vi.fn(),
    updateJob: vi.fn(),
    updateSettings: vi.fn()
  };
});

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

const mockSettings = {
  scriptModel: "gemini-3-flash-preview",
  ttsModel: "gemini-2.5-flash-preview-tts",
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
      voiceName: "Leda",
      label: "Leda",
      tone: "Youthful",
      gender: "female" as const
    },
    {
      voiceName: "Charon",
      label: "Charon",
      tone: "Informative",
      gender: "male" as const
    }
  ],
  excitedPresets: []
};

function buildJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    jobId: "job-1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ownerEmail: activeUser.email,
    title: "Job Satu",
    description: "Deskripsi job",
    contentType: "affiliate",
    voiceGender: "female",
    tone: "natural",
    ctaText: "cek detailnya sekarang",
    referenceLink: "https://contoh.test/ref",
    videoPath: "C:/video.mp4",
    videoMimeType: "video/mp4",
    videoDurationSec: 20,
    status: "running",
    progress: {
      phase: "rendering",
      percent: 95,
      label: "Merender video final",
      updatedAt: "2026-04-01T00:00:00.000Z"
    },
    output: {
      captionPath: "/outputs/job-1/caption.txt",
      finalVideoPath: "/outputs/job-1/final.mp4",
      artifactPaths: ["/outputs/job-1/caption.txt", "/outputs/job-1/final.mp4"],
      updatedAt: "2026-04-01T00:00:00.000Z"
    },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
  vi.mocked(api.completeGoogleOAuthRedirect).mockResolvedValue({ sessionReady: false });
  vi.mocked(api.fetchSession).mockResolvedValue(null);
  vi.mocked(api.fetchJobs).mockResolvedValue([]);
  vi.mocked(api.fetchGenerationCapacity).mockResolvedValue({
    overloaded: false,
    runningCount: 0,
    queuedCount: 0,
    maxRunningJobs: 3,
    maxQueuedJobs: 20,
    maxRunningPerUser: 1,
    message: "Server siap menerima job baru."
  });
  vi.mocked(api.fetchSettings).mockResolvedValue(mockSettings);
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
        label: "10 video",
        payAmountIdr: 20_000,
        creditAmountIdr: 20_000,
        bonusAmountIdr: 0,
        generateCredits: 10
      }
    ],
    recentLedger: [],
    recentTopups: []
  });
  vi.mocked(api.fetchTtsVoices).mockResolvedValue(mockVoices);
  vi.mocked(api.updateSettings).mockResolvedValue(mockSettings);
});

describe("web smoke", () => {
  it("renders landing page when session is empty", async () => {
    render(<App />);

    expect(await screen.findByText(/Voiceshort/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Bikin voice over video pendek lebih cepat/i })).toBeTruthy();
    expect(screen.getAllByText(/TikTok/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Rp20.000/i)).toBeTruthy();
  });

  it("starts Google OAuth from landing page", async () => {
    render(<App />);

    expect(await screen.findByText(/Voiceshort/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Masuk dengan Google/i }));

    await waitFor(() => {
      expect(api.startGoogleLogin).toHaveBeenCalledWith("/?view=generate");
    });
  });

  it("shows a friendly message when Google auth is not ready", async () => {
    vi.mocked(api.isAuthReady).mockReturnValue(false);
    render(<App />);

    expect(await screen.findByText(/Voiceshort/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Masuk dengan Google/i }));

    expect(await screen.findByText(/Masuk Google belum tersedia/i)).toBeTruthy();
    expect(api.startGoogleLogin).not.toHaveBeenCalled();
  });

  it("logs in with email and opens the dashboard", async () => {
    vi.mocked(api.login).mockResolvedValue({
      user: activeUser,
      message: "Berhasil masuk. Selamat datang kembali."
    });

    render(<App />);

    await screen.findByRole("heading", { name: /Bikin voice over video pendek/i });
    fireEvent.change(screen.getByLabelText(/^Email$/i), {
      target: { value: activeUser.email }
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: "password-rahasia" }
    });
    const submitButtons = screen.getAllByRole("button", { name: /^Masuk$/i });
    fireEvent.click(submitButtons[submitButtons.length - 1]!);

    expect(await screen.findByText(/saldo Rp16.000/i)).toBeTruthy();
    expect(api.login).toHaveBeenCalledWith({
      email: activeUser.email,
      password: "password-rahasia"
    });
  });

  it("shows email confirmation instructions after register when session is not active yet", async () => {
    vi.mocked(api.register).mockResolvedValue({
      user: null,
      message: "Pendaftaran berhasil. Silakan cek email Anda untuk konfirmasi, lalu masuk kembali.",
      needsEmailConfirmation: true
    });

    render(<App />);

    await screen.findByRole("heading", { name: /Bikin voice over video pendek/i });
    fireEvent.click(screen.getByRole("button", { name: /^Daftar$/i }));
    fireEvent.change(screen.getByLabelText(/^Nama$/i), {
      target: { value: "Creator Baru" }
    });
    fireEvent.change(screen.getByLabelText(/^Email$/i), {
      target: { value: "baru@test.dev" }
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: "password-rahasia" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Buat Akun/i }));

    expect(await screen.findByText(/Silakan cek email Anda/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Buat Audio/i })).toBeNull();
  });

  it("does not expose AI engine labels to regular users", async () => {
    vi.mocked(api.fetchSession).mockResolvedValue(activeUser);

    render(<App />);

    expect(await screen.findByText(/saldo Rp16.000/i)).toBeTruthy();
    expect(screen.queryByText(/Gemini|Script Model|TTS Model|AI engine/i)).toBeNull();
  });

  it("shows one initial slot, required markers, and optional link field", async () => {
    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: /^slot video 1$/i })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /^slot video 2$/i })).toBeNull();
    expect(screen.getByText(/slot aktif 1\/10/i)).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: /^slot video 1$/i })).getByText(
        (_, node) => node?.textContent === "Video *"
      )
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: /^slot video 1$/i })).getByText(
        (_, node) => node?.textContent === "Judul *"
      )
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: /^slot video 1$/i })).getByText(
        (_, node) => node?.textContent === "Brief / Deskripsi *"
      )
    ).toBeTruthy();
    expect(screen.getByLabelText(/Link Referensi Opsional/i)).toBeTruthy();
    await waitFor(() => {
      expect(api.fetchGenerationCapacity).toHaveBeenCalled();
    });
  });

  it("adds slots one by one until reaching the maximum of 10", async () => {
    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(api.fetchGenerationCapacity).toHaveBeenCalled();
    });

    for (let slotNumber = 2; slotNumber <= 10; slotNumber += 1) {
      fireEvent.click(screen.getByRole("button", { name: /Tambah Slot/i }));
      expect(screen.getByRole("region", { name: new RegExp(`^slot video ${slotNumber}$`, "i") })).toBeTruthy();
    }

    expect(screen.getByText(/slot aktif 10\/10/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tambah Slot/i })).toBeNull();
    expect(screen.getByText(/batas maksimum 10 slot sudah tercapai/i)).toBeTruthy();
  });

  it("shows unlimited balance and keeps generate enabled for whitelist users", async () => {
    render(
      <GeneratePage
        currentUser={{
          ...adminUser,
          walletBalanceIdr: 0,
          generateCreditsRemaining: null,
          videoQuotaRemaining: null,
          isUnlimited: true
        }}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    expect(screen.getByText(/Saldo Unlimited/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Proses Video yang Siap/i }) as HTMLButtonElement).disabled).toBe(
      false
    );
    await waitFor(() => {
      expect(api.fetchGenerationCapacity).toHaveBeenCalled();
    });
  });

  it("submits only ready slots and leaves incomplete slots with inline errors", async () => {
    const onRefreshSession = vi.fn(async () => undefined);
    const onViewJobs = vi.fn();
    vi.mocked(api.createJob).mockResolvedValueOnce({
      jobId: "job-101",
      status: "queued",
      progress: {
        phase: "queued",
        percent: 0,
        label: "Masuk antrean",
        updatedAt: "2026-04-01T00:00:00.000Z"
      }
    });

    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={onRefreshSession}
        onViewJobs={onViewJobs}
      />
    );

    const slotOne = screen.getByRole("region", { name: /^slot video 1$/i });
    const file = new File(["video-one"], "slot-1.mp4", { type: "video/mp4" });

    fireEvent.click(screen.getByRole("button", { name: /Tambah Slot/i }));

    const slotTwo = screen.getByRole("region", { name: /^slot video 2$/i });

    fireEvent.change(within(slotOne).getByLabelText(/^Video/i), {
      target: { files: [file] }
    });
    fireEvent.change(within(slotOne).getByLabelText(/^Judul/i), {
      target: { value: "Judul Slot 1" }
    });
    fireEvent.change(within(slotOne).getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Brief slot satu" }
    });

    fireEvent.change(within(slotTwo).getByLabelText(/^Judul/i), {
      target: { value: "Judul Belum Lengkap" }
    });

    fireEvent.click(screen.getByRole("button", { name: /proses video yang siap/i }));

    await waitFor(() => {
      expect(api.createJob).toHaveBeenCalledTimes(1);
    });
    expect(api.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Judul Slot 1",
        description: "Brief slot satu"
      })
    );
    expect(onRefreshSession).toHaveBeenCalledTimes(1);
    expect(onViewJobs).toHaveBeenCalledWith("job-101");
    expect(await screen.findByText(/Berhasil 1/i)).toBeTruthy();
    expect(screen.getByText(/Perlu dilengkapi 1/i)).toBeTruthy();
    expect(within(slotTwo).getByText(/Lengkapi video, judul, brief\/deskripsi/i)).toBeTruthy();
  });

  it("blocks batch submit when ready slots exceed remaining deposit balance", async () => {
    render(
      <GeneratePage
        currentUser={{
          ...activeUser,
          walletBalanceIdr: 2_000,
          generateCreditsRemaining: 1,
          videoQuotaRemaining: 1
        }}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    const firstFile = new File(["video-one"], "slot-1.mp4", { type: "video/mp4" });
    const secondFile = new File(["video-two"], "slot-2.mp4", { type: "video/mp4" });
    const slotOne = screen.getByRole("region", { name: /^slot video 1$/i });

    fireEvent.click(screen.getByRole("button", { name: /Tambah Slot/i }));

    const slotTwo = screen.getByRole("region", { name: /^slot video 2$/i });

    fireEvent.change(within(slotOne).getByLabelText(/^Video/i), {
      target: { files: [firstFile] }
    });
    fireEvent.change(within(slotOne).getByLabelText(/^Judul/i), {
      target: { value: "Judul Slot 1" }
    });
    fireEvent.change(within(slotOne).getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Brief slot satu" }
    });

    fireEvent.change(within(slotTwo).getByLabelText(/^Video/i), {
      target: { files: [secondFile] }
    });
    fireEvent.change(within(slotTwo).getByLabelText(/^Judul/i), {
      target: { value: "Judul Slot 2" }
    });
    fireEvent.change(within(slotTwo).getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Brief slot dua" }
    });

    fireEvent.click(screen.getByRole("button", { name: /proses video yang siap/i }));

    expect(await screen.findByText(/melebihi sisa saldo anda/i)).toBeTruthy();
    expect(api.createJob).not.toHaveBeenCalled();
  });

  it("shows server overload banner and disables submit button", async () => {
    vi.mocked(api.fetchGenerationCapacity).mockResolvedValue({
      overloaded: true,
      runningCount: 3,
      queuedCount: 20,
      maxRunningJobs: 3,
      maxQueuedJobs: 20,
      maxRunningPerUser: 1,
      message: "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi."
    });

    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    expect(await screen.findByText(/^Server overload$/i)).toBeTruthy();
    expect(screen.getByText(/Aktif 3\/3 \| Antrean 20\/20/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Proses Video yang Siap/i }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("stops batch submit after the first server overload response", async () => {
    const onRefreshSession = vi.fn(async () => undefined);
    const onViewJobs = vi.fn();
    vi.mocked(api.createJob)
      .mockResolvedValueOnce({
        jobId: "job-301",
        status: "queued",
        progress: {
          phase: "queued",
          percent: 0,
          label: "Masuk antrean",
          updatedAt: "2026-04-01T00:00:00.000Z"
        }
      })
      .mockRejectedValueOnce(new api.ApiError(503, "Server overload. Antrean generate sedang penuh, coba lagi beberapa saat lagi."));

    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={onRefreshSession}
        onViewJobs={onViewJobs}
      />
    );

    const slotOne = screen.getByRole("region", { name: /^slot video 1$/i });

    fireEvent.click(screen.getByRole("button", { name: /Tambah Slot/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tambah Slot/i }));

    const slotTwo = screen.getByRole("region", { name: /^slot video 2$/i });
    const slotThree = screen.getByRole("region", { name: /^slot video 3$/i });

    for (const [slot, title, description, filename] of [
      [slotOne, "Judul Slot 1", "Brief slot satu", "slot-1.mp4"],
      [slotTwo, "Judul Slot 2", "Brief slot dua", "slot-2.mp4"],
      [slotThree, "Judul Slot 3", "Brief slot tiga", "slot-3.mp4"]
    ] as const) {
      fireEvent.change(within(slot).getByLabelText(/^Video/i), {
        target: { files: [new File(["video"], filename, { type: "video/mp4" })] }
      });
      fireEvent.change(within(slot).getByLabelText(/^Judul/i), {
        target: { value: title }
      });
      fireEvent.change(within(slot).getByLabelText(/Brief \/ Deskripsi/i), {
        target: { value: description }
      });
    }

    fireEvent.click(screen.getByRole("button", { name: /proses video yang siap/i }));

    await waitFor(() => {
      expect(api.createJob).toHaveBeenCalledTimes(2);
    });

    expect(onRefreshSession).toHaveBeenCalledTimes(1);
    expect(onViewJobs).toHaveBeenCalledWith("job-301");
    expect(await screen.findByText(/^Server overload$/i)).toBeTruthy();
    expect(screen.getByText(/Gagal 1/i)).toBeTruthy();
    expect(within(slotTwo).getByText(/Server overload/i)).toBeTruthy();
    expect(within(slotThree).getByText(/^Siap$/i)).toBeTruthy();
  });

  it("renders deposit packages and creates a WebQRIS invoice", async () => {
    vi.mocked(api.createTopup).mockResolvedValue({
      id: "topup-1",
      packageCode: "10_video",
      payAmountIdr: 20_000,
      creditAmountIdr: 20_000,
      merchantOrderId: "VS-ORDER-1",
      webqrisInvoiceId: "INV-TEST-1",
      qrisPayload: "00020101021226680016ID.CO.QRIS.WWW",
      uniqueCode: 42,
      totalAmountIdr: 20_042,
      status: "pending",
      expiredAt: "2026-04-28T12:00:00.000Z",
      paidAt: null,
      paymentMethod: null,
      createdAt: "2026-04-28T11:30:00.000Z",
      updatedAt: "2026-04-28T11:30:00.000Z"
    });
    vi.mocked(api.fetchSession).mockResolvedValue(activeUser);

    render(<App />);

    await screen.findByText(/saldo Rp16.000/i);
    fireEvent.click(screen.getByRole("button", { name: /Isi Saldo/i }));

    expect(await screen.findByRole("heading", { name: /Isi saldo lewat QRIS/i })).toBeTruthy();
    expect(screen.getAllByText(/10 video/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Tampilkan QRIS/i }));

    expect(await screen.findByText(/INV-TEST-1/i)).toBeTruthy();
    expect(
      screen.getByText((content) => content.replace(/\s/g, "") === "Rp20.042")
    ).toBeTruthy();
    expect(api.createTopup).toHaveBeenCalledWith("10_video");
  });

  it("continues batch submit when one ready slot fails", async () => {
    const onRefreshSession = vi.fn(async () => undefined);
    const onViewJobs = vi.fn();
    vi.mocked(api.createJob)
      .mockRejectedValueOnce(new Error("Server slot 1 gagal"))
      .mockResolvedValueOnce({
        jobId: "job-202",
        status: "queued",
        progress: {
          phase: "queued",
          percent: 0,
          label: "Masuk antrean",
          updatedAt: "2026-04-01T00:00:00.000Z"
        }
      });

    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={onRefreshSession}
        onViewJobs={onViewJobs}
      />
    );

    const slotOne = screen.getByRole("region", { name: /^slot video 1$/i });

    fireEvent.click(screen.getByRole("button", { name: /Tambah Slot/i }));

    const slotTwo = screen.getByRole("region", { name: /^slot video 2$/i });

    fireEvent.change(within(slotOne).getByLabelText(/^Video/i), {
      target: { files: [new File(["video-one"], "slot-1.mp4", { type: "video/mp4" })] }
    });
    fireEvent.change(within(slotOne).getByLabelText(/^Judul/i), {
      target: { value: "Judul Slot 1" }
    });
    fireEvent.change(within(slotOne).getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Brief slot satu" }
    });

    fireEvent.change(within(slotTwo).getByLabelText(/^Video/i), {
      target: { files: [new File(["video-two"], "slot-2.mp4", { type: "video/mp4" })] }
    });
    fireEvent.change(within(slotTwo).getByLabelText(/^Judul/i), {
      target: { value: "Judul Slot 2" }
    });
    fireEvent.change(within(slotTwo).getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Brief slot dua" }
    });

    fireEvent.click(screen.getByRole("button", { name: /proses video yang siap/i }));

    await waitFor(() => {
      expect(api.createJob).toHaveBeenCalledTimes(2);
    });
    expect(onRefreshSession).toHaveBeenCalledTimes(1);
    expect(onViewJobs).toHaveBeenCalledWith("job-202");
    expect(await screen.findByText(/Gagal 1/i)).toBeTruthy();
    expect(screen.getByText(/Berhasil 1/i)).toBeTruthy();
    expect(within(slotOne).getByText(/Server slot 1 gagal/i)).toBeTruthy();
  });

  it("does not redirect to jobs when no slot is successfully created", async () => {
    const onViewJobs = vi.fn();
    vi.mocked(api.createJob).mockRejectedValueOnce(new Error("Server gagal total"));

    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={onViewJobs}
      />
    );

    const slotOne = screen.getByRole("region", { name: /^slot video 1$/i });

    fireEvent.change(within(slotOne).getByLabelText(/^Video/i), {
      target: { files: [new File(["video-one"], "slot-1.mp4", { type: "video/mp4" })] }
    });
    fireEvent.change(within(slotOne).getByLabelText(/^Judul/i), {
      target: { value: "Judul Slot 1" }
    });
    fireEvent.change(within(slotOne).getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Brief slot satu" }
    });

    fireEvent.click(screen.getByRole("button", { name: /proses video yang siap/i }));

    expect(await within(slotOne).findByText(/Server gagal total/i)).toBeTruthy();
    expect(onViewJobs).not.toHaveBeenCalled();
  });

  it("renders jobs page progress for authenticated user", async () => {
    vi.mocked(api.fetchSession).mockResolvedValue(activeUser);
    vi.mocked(api.fetchJobs).mockResolvedValue([buildJob()]);

    render(<App />);

    expect(await screen.findByText(/Creator/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Riwayat/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Riwayat/i }));

    expect(await screen.findByRole("heading", { name: /Detail Proses/i })).toBeTruthy();
    expect(screen.getByText(/Merender video final/i)).toBeTruthy();
    expect(screen.getByLabelText(/Job progress/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Download Final Video/i })).toBeTruthy();
    expect(screen.queryByText(/Hashtag Arahan:/i)).toBeNull();
  });

  it("renders admin navigation for superadmin", async () => {
    vi.mocked(api.fetchSession).mockResolvedValue(adminUser);
    vi.mocked(api.fetchJobs).mockResolvedValue([]);
    vi.mocked(api.fetchAdminUsers).mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText(/Jho/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Admin/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Admin/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Kelola user, akses, dan paket saldo/i })).toBeTruthy();
    });
  });

  it("uses backend output url for voice preview audio", async () => {
    vi.mocked(api.previewTtsVoice).mockResolvedValue({
      voiceName: "Charon",
      previewPath: "/outputs/_voice_previews/sample-preview.wav"
    });

    render(<SettingsPage />);

    expect(await screen.findByRole("heading", { name: /Pengaturan Layanan/i })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Preview Suara/i })[0]!);

    await waitFor(() => {
      expect(api.previewTtsVoice).toHaveBeenCalledTimes(1);
    });

    const audio = document.querySelector("audio.audio-preview") as HTMLAudioElement | null;
    expect(audio).toBeTruthy();
    expect(audio?.src).toBe("http://localhost:8788/outputs/_voice_previews/sample-preview.wav");
  });
});
