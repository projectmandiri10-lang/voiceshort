import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { GeneratePage } from "./pages/GeneratePage";
import { JobsPage } from "./pages/JobsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AuthUser, JobRecord } from "./types";
import * as api from "./api";
import * as videoDuration from "./video-duration";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    completeGoogleOAuthRedirect: vi.fn(),
    createAdminUser: vi.fn(),
    createJob: vi.fn(),
    createTopup: vi.fn(),
    deleteJob: vi.fn(),
    disableAdminUser: vi.fn(),
    downloadJobCaption: vi.fn(),
    downloadJobFinalVideo: vi.fn(),
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

vi.mock("./video-duration", () => ({
  readVideoDuration: vi.fn(async () => 60)
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

const mockSettings = {
  scriptModel: "gemini-3-flash-preview",
  ttsModel: "gemini-2.5-flash-preview-tts",
  language: "id-ID" as const,
  maxVideoSeconds: 900,
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

function buildSuccessProgress() {
  return {
    phase: "success" as const,
    percent: 100,
    label: "Selesai",
    updatedAt: "2026-04-01T00:00:00.000Z"
  };
}

function buildJob(
  overrides: Partial<JobRecord> & {
    output?: Partial<JobRecord["output"]>;
  } = {}
): JobRecord {
  const { output, ...jobOverrides } = overrides;
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
      updatedAt: "2026-04-01T00:00:00.000Z",
      ...output
    },
    ...jobOverrides
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
        label: "10 menit",
        payAmountIdr: 20_000,
        creditAmountIdr: 20_000,
        bonusAmountIdr: 0,
        generateCredits: 10
      }
    ],
    recentLedger: [],
    recentTopups: []
  });
  vi.mocked(videoDuration.readVideoDuration).mockResolvedValue(60);
  vi.mocked(api.fetchTtsVoices).mockResolvedValue(mockVoices);
  vi.mocked(api.updateSettings).mockResolvedValue(mockSettings);
  vi.mocked(api.downloadJobCaption).mockResolvedValue(undefined);
  vi.mocked(api.downloadJobFinalVideo).mockResolvedValue(undefined);
});

describe("web smoke", () => {
  it("renders landing page when session is empty", async () => {
    render(<App />);

    expect(await screen.findByText(/Real Voice Over Video/i)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /Bikin voice over video sampai 15 menit lebih cepat/i })
    ).toBeTruthy();
    expect(screen.getAllByText(/TikTok/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Rp20.000/i)).toBeTruthy();
    expect(screen.getByText(/Rp\.2000\/menit/i)).toBeTruthy();
  });

  it("starts Google OAuth from landing page", async () => {
    render(<App />);

    expect(await screen.findByText(/Real Voice Over Video/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Masuk dengan Google/i }));

    await waitFor(() => {
      expect(api.startGoogleLogin).toHaveBeenCalledWith("/?view=generate");
    });
  });

  it("shows a friendly message when Google auth is not ready", async () => {
    vi.mocked(api.isAuthReady).mockReturnValue(false);
    render(<App />);

    expect(await screen.findByText(/Real Voice Over Video/i)).toBeTruthy();
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

    await screen.findByRole("heading", { name: /Bikin voice over video sampai 15 menit/i });
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

  it("shows email confirmation instructions after register when session is not active yet", async () => {
    vi.mocked(api.register).mockResolvedValue({
      user: null,
      message: "Pendaftaran berhasil. Silakan cek email Anda untuk konfirmasi, lalu masuk kembali.",
      needsEmailConfirmation: true
    });

    render(<App />);

    await screen.findByRole("heading", { name: /Bikin voice over video sampai 15 menit/i });
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

    expect(await screen.findByText(/^Creator$/i)).toBeTruthy();
    expect(screen.queryByText(/Gemini|Script Model|TTS Model|AI engine/i)).toBeNull();
  });

  it("renders the single-job form with required inputs and optional link field", async () => {
    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: /^slot video 1$/i })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /^slot video 2$/i })).toBeNull();
    expect(screen.getByText(/Single Job Workspace/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Judul/i)).toBeTruthy();
    expect(screen.getByLabelText(/Brief \/ Deskripsi/i)).toBeTruthy();
    expect(screen.getByLabelText(/Link Referensi Opsional/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate Job Baru/i })).toBeTruthy();

    await waitFor(() => {
      expect(api.fetchJobs).toHaveBeenCalled();
      expect(api.fetchGenerationCapacity).toHaveBeenCalled();
    });
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
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: /Generate Job Baru/i }) as HTMLButtonElement).disabled
      ).toBe(false);
    });
  });

  it("locks generate when previous success job still needs caption and final video download", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([
      buildJob({
        status: "success",
        progress: buildSuccessProgress(),
        output: {
          captionDownloadedAt: undefined,
          finalVideoDownloadedAt: undefined
        }
      })
    ]);

    render(
      <GeneratePage
        currentUser={activeUser}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    expect(await screen.findByText(/unduh caption dan final video terlebih dahulu/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Generate Job Baru/i }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("submits one ready job and redirects to the jobs page", async () => {
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

    const file = new File(["video-one"], "slot-1.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText(/^Video/i), {
      target: { files: [file] }
    });
    await waitFor(() => {
      expect(videoDuration.readVideoDuration).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(screen.getByLabelText(/^Judul/i), {
      target: { value: "Judul Slot 1" }
    });
    fireEvent.change(screen.getByLabelText(/Brief \/ Deskripsi/i), {
      target: { value: "Brief slot satu" }
    });

    fireEvent.click(screen.getByRole("button", { name: /Generate Job Baru/i }));

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
  });

  it("disables generate when user balance is insufficient", async () => {
    render(
      <GeneratePage
        currentUser={{
          ...activeUser,
          walletBalanceIdr: 0,
          generateCreditsRemaining: 0,
          videoQuotaRemaining: 0
        }}
        onRefreshSession={vi.fn(async () => undefined)}
        onViewJobs={vi.fn()}
      />
    );

    expect(screen.getByText(/Perlu isi saldo/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Generate Job Baru/i }) as HTMLButtonElement).disabled
    ).toBe(true);
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
      (screen.getByRole("button", { name: /Generate Job Baru/i }) as HTMLButtonElement).disabled
    ).toBe(true);
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

    await screen.findByText(/^Creator$/i);
    fireEvent.click(screen.getByRole("button", { name: /^Isi Saldo$/i }));

    expect(await screen.findByRole("heading", { name: /Isi saldo lewat QRIS/i })).toBeTruthy();
    expect(screen.getAllByText(/10 menit/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Tampilkan QRIS/i }));

    expect(await screen.findByText(/INV-TEST-1/i)).toBeTruthy();
    expect(screen.getByText((content) => content.replace(/\s/g, "") === "Rp20.042")).toBeTruthy();
    expect(api.createTopup).toHaveBeenCalledWith("10_video");
  });

  it("renders jobs page download status and blocks delete for pending-download success jobs", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([
      buildJob({
        status: "success",
        progress: buildSuccessProgress(),
        output: {
          captionDownloadedAt: undefined,
          finalVideoDownloadedAt: undefined
        }
      })
    ]);

    render(
      <JobsPage currentUser={activeUser} selectedJobId="job-1" onSelectJob={vi.fn()} />
    );

    expect(await screen.findByRole("heading", { name: /Detail Proses/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download Caption/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download Final Video/i })).toBeTruthy();
    expect(screen.getByText(/Status Caption/i)).toBeTruthy();
    expect(screen.getByText(/Status Final Video/i)).toBeTruthy();
    expect(screen.getByText(/Generate job baru masih terkunci/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Hapus Proses/i }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("updates jobs page status after caption and final video downloads complete", async () => {
    const pendingJob = buildJob({
      status: "success",
      progress: buildSuccessProgress(),
      output: {
        captionDownloadedAt: undefined,
        finalVideoDownloadedAt: undefined
      }
    });
    const captionDownloadedJob = buildJob({
      status: "success",
      progress: buildSuccessProgress(),
      output: {
        captionDownloadedAt: "2026-04-01T00:10:00.000Z",
        finalVideoDownloadedAt: undefined
      }
    });
    const fullyDownloadedJob = buildJob({
      status: "success",
      progress: buildSuccessProgress(),
      output: {
        captionDownloadedAt: "2026-04-01T00:10:00.000Z",
        finalVideoDownloadedAt: "2026-04-01T00:11:00.000Z"
      }
    });

    vi.mocked(api.fetchJobs).mockResolvedValue([pendingJob]);
    vi.mocked(api.fetchJobDetail)
      .mockResolvedValueOnce(captionDownloadedJob)
      .mockResolvedValueOnce(fullyDownloadedJob);

    render(
      <JobsPage currentUser={activeUser} selectedJobId="job-1" onSelectJob={vi.fn()} />
    );

    expect(await screen.findByRole("button", { name: /Download Caption/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Download Caption/i }));

    await waitFor(() => {
      expect(api.downloadJobCaption).toHaveBeenCalledWith("job-1");
    });
    expect(await screen.findByText(/Caption berhasil diunduh/i)).toBeTruthy();
    expect(screen.getByText(/Sudah diunduh/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Download Final Video/i }));

    await waitFor(() => {
      expect(api.downloadJobFinalVideo).toHaveBeenCalledWith("job-1");
    });
    await waitFor(() => {
      expect(
        screen.getAllByText(
          /Semua file wajib sudah diunduh\. Generate job baru sekarang sudah aktif kembali\./i
        ).length
      ).toBeGreaterThan(0);
    });
  });

  it("renders admin navigation for superadmin", async () => {
    vi.mocked(api.fetchSession).mockResolvedValue(adminUser);
    vi.mocked(api.fetchJobs).mockResolvedValue([]);
    vi.mocked(api.fetchAdminUsers).mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText(/^Jho$/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Admin$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Admin$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Kelola user, akses, dan paket saldo/i })
      ).toBeTruthy();
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
