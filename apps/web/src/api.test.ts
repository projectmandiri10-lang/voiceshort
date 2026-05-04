import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveOutputUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the backend api origin for output files in development", async () => {
    vi.stubEnv("DEV", true);

    const api = await import("./api");

    expect(api.resolveOutputUrl("/outputs/job-1/final.mp4")).toBe(
      "http://localhost:8788/outputs/job-1/final.mp4"
    );
  });

  it("respects explicit VITE_API_BASE when provided", async () => {
    vi.stubEnv("VITE_API_BASE", "https://api.example.test");

    const api = await import("./api");

    expect(api.resolveOutputUrl("/outputs/job-2/caption.txt")).toBe(
      "https://api.example.test/outputs/job-2/caption.txt"
    );
  });

  it("keeps absolute output urls unchanged", async () => {
    const api = await import("./api");

    expect(api.resolveOutputUrl("https://cdn.example.test/final.mp4")).toBe(
      "https://cdn.example.test/final.mp4"
    );
  });
});
