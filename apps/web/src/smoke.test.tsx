import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { GeneratePage } from "./pages/GeneratePage";
import type { JobRecord } from "./types";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    createJob: vi.fn(),
    deleteJob: vi.fn(),
    fetchJobDetail: vi.fn(),
    fetchJobs: vi.fn(),
    fetchSettings: vi.fn(),
    fetchTtsVoices: vi.fn(),
    openJobOutputLocation: vi.fn(),
    previewTtsVoice: vi.fn(),
    retryJob: vi.fn(),
    updateJob: vi.fn(),
    updateSettings: vi.fn()
  };
});

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
      voiceName: "Aoede",
      label: "Aoede",
      tone: "Breezy",
      gender: "female" as const
    },
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
  excitedPresets: [
    {
      presetId: "female_excited_v1",
      label: "Excited Wanita V1",
      version: "v1",
      gender: "female" as const,
      voiceName: "Leda"
    }
  ]
};

function buildJob(
  overrides: Omit<Partial<JobRecord>, "output"> & {
    output?: Partial<JobRecord["output"]>;
  } = {}
): JobRecord {
  const { output, ...jobOverrides } = overrides;

  return {
    jobId: "job-1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    title: "Job Satu",
    description: "Deskripsi Job",
    contentType: "affiliate",
    voiceGender: "female",
    tone: "natural",
    ctaText: "cek detailnya sekarang",
    referenceLink: "https://contoh.test/ref",
    videoPath: "C:/video.mp4",
    videoMimeType: "video/mp4",
    videoDurationSec: 20,
    status: "failed",
    progress: 100,
    progressLabel: "Generate voice over gagal.",
    errorMessage: "fetch failed",
    output: {
      captionPath: "/outputs/job-1/caption.txt",
      voicePath: undefined,
      finalVideoPath: "/outputs/job-1/final.mp4",
      artifactPaths: [
        "/outputs/job-1/caption.txt",
        "/outputs/job-1/final.mp4"
      ],
      updatedAt: "2026-04-01T00:00:00.000Z",
      ...output
    },
    ...jobOverrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchSettings).mockResolvedValue(mockSettings);
  vi.mocked(api.fetchTtsVoices).mockResolvedValue(mockVoices);
  vi.mocked(api.fetchJobs).mockResolvedValue([]);
  vi.mocked(api.updateSettings).mockResolvedValue(mockSettings);
});

describe("web smoke", () => {
  it("renders the app shell and settings gender voice dropdown", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /general ai voice over shorts/i })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByDisplayValue(mockSettings.scriptModel)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Pria/i })).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: /Wanita/i })).toBeTruthy();
  });

  it("shows generate form validation before submit", async () => {
    render(<GeneratePage />);

    expect(await screen.findByRole("button", { name: /generate voice over/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /generate voice over/i }));

    expect(
      await screen.findByText(
        /Video, judul, brief\/deskripsi, kategori konten, gender suara, dan tone wajib diisi./i
      )
    ).toBeTruthy();
    expect(api.createJob).not.toHaveBeenCalled();
  });

  it("renders jobs page with previous attempt context and output links", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([buildJob()]);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));

    expect(await screen.findByRole("heading", { name: /detail job/i })).toBeTruthy();
    expect(screen.getAllByText("Job Satu").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /edit job/i })).toBeTruthy();
    expect(screen.getAllByText(/Percobaan terakhir/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Error proses terakhir/i)).toBeTruthy();
    expect(screen.getByText("fetch failed")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry job/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /caption/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /audio/i })).toBeNull();
    expect(screen.getByRole("link", { name: /final video/i })).toBeTruthy();
  });

  it("renders caption link from legacy script path", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([
      buildJob({
        output: {
          captionPath: undefined,
          scriptPath: "/outputs/job-1/script.txt",
          artifactPaths: [
            "/outputs/job-1/script.txt",
            "/outputs/job-1/final.mp4"
          ]
        }
      })
    ]);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));

    expect(await screen.findByRole("heading", { name: /detail job/i })).toBeTruthy();
    const captionLink = screen.getByRole("link", { name: /caption/i }) as HTMLAnchorElement;
    expect(captionLink.href).toContain("/outputs/job-1/script.txt");
  });

  it("saves failed job edits without triggering retry", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([buildJob()]);
    vi.mocked(api.updateJob).mockResolvedValue(
      buildJob({
        title: "Job Baru",
        description: "Brief baru",
        contentType: "motivasi",
        voiceGender: "male",
        tone: "hangat",
        ctaText: "ikuti sekarang",
        referenceLink: "https://contoh.test/a"
      })
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));

    expect(await screen.findByRole("heading", { name: /detail job/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /edit job/i }));

    expect(await screen.findByRole("heading", { name: /edit job/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Judul"), {
      target: { value: "Job Baru" }
    });
    fireEvent.change(screen.getByLabelText("Brief / Deskripsi"), {
      target: { value: "Brief baru" }
    });
    fireEvent.change(screen.getByLabelText("Kategori Konten"), {
      target: { value: "motivasi" }
    });
    fireEvent.change(screen.getByLabelText("Gender Suara"), {
      target: { value: "male" }
    });
    fireEvent.change(screen.getByLabelText("Tone"), {
      target: { value: "hangat" }
    });
    fireEvent.change(screen.getByLabelText("CTA Opsional"), {
      target: { value: "ikuti sekarang" }
    });
    fireEvent.change(screen.getByLabelText("Reference Link Opsional"), {
      target: { value: "https://contoh.test/a" }
    });
    fireEvent.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    await waitFor(() => {
      expect(api.updateJob).toHaveBeenCalledWith("job-1", {
        title: "Job Baru",
        description: "Brief baru",
        contentType: "motivasi",
        voiceGender: "male",
        tone: "hangat",
        ctaText: "ikuti sekarang",
        referenceLink: "https://contoh.test/a"
      });
    });
    expect(api.retryJob).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /detail job/i })).toBeTruthy();
    expect(
      await screen.findByText(/Perubahan tersimpan. Klik Retry Job untuk memproses ulang./i)
    ).toBeTruthy();
  });

  it("shows queued save message after editing queued job metadata", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([
      buildJob({
        status: "queued",
        errorMessage: undefined,
        output: {
          captionPath: undefined,
          scriptPath: undefined,
          voicePath: undefined,
          finalVideoPath: undefined,
          artifactPaths: []
        }
      })
    ]);
    vi.mocked(api.updateJob).mockResolvedValue(
      buildJob({
        status: "queued",
        title: "Job Queue Baru",
        errorMessage: undefined,
        output: {
          captionPath: undefined,
          scriptPath: undefined,
          voicePath: undefined,
          finalVideoPath: undefined,
          artifactPaths: []
        }
      })
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));

    expect(await screen.findByRole("heading", { name: /detail job/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /edit job/i }));
    fireEvent.change(screen.getByLabelText("Judul"), {
      target: { value: "Job Queue Baru" }
    });
    fireEvent.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    expect(
      await screen.findByText(
        /Perubahan tersimpan. Perubahan akan dipakai selama job belum mulai diproses./i
      )
    ).toBeTruthy();
  });

  it("hides edit controls for running jobs", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([
      buildJob({
        status: "running",
        errorMessage: undefined
      })
    ]);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));

    expect(await screen.findByRole("heading", { name: /detail job/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit job/i })).toBeNull();
    expect(
      screen.getByText(/Metadata job tidak bisa diubah setelah job berjalan atau selesai./i)
    ).toBeTruthy();
  });

  it("hides edit controls for success jobs", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([
      buildJob({
        status: "success",
        errorMessage: undefined
      })
    ]);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));

    expect(await screen.findByRole("heading", { name: /detail job/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit job/i })).toBeNull();
    expect(
      screen.getByText(/Metadata job tidak bisa diubah setelah job berjalan atau selesai./i)
    ).toBeTruthy();
  });

  it("closes edit mode and reloads detail when save gets a 409 conflict", async () => {
    vi.mocked(api.fetchJobs).mockResolvedValue([buildJob()]);
    vi.mocked(api.fetchJobDetail).mockResolvedValue(
      buildJob({
        status: "running",
        errorMessage: undefined
      })
    );
    vi.mocked(api.updateJob).mockRejectedValue(
      new api.ApiError(409, "Job hanya bisa diedit saat status queued, failed, atau interrupted.")
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));

    expect(await screen.findByRole("heading", { name: /detail job/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /edit job/i }));
    fireEvent.change(screen.getByLabelText("Judul"), {
      target: { value: "Judul Bentrok" }
    });
    fireEvent.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    await waitFor(() => {
      expect(api.fetchJobDetail).toHaveBeenCalledWith("job-1");
    });
    expect(screen.getByRole("heading", { name: /detail job/i })).toBeTruthy();
    expect(
      await screen.findByText(/Job ini sudah tidak bisa diedit karena statusnya berubah./i)
    ).toBeTruthy();
  });
});
