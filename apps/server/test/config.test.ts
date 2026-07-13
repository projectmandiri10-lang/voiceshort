import { afterEach, describe, expect, it, vi } from "vitest";

describe("legacy server environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("loads script-only provider settings", async () => {
    vi.stubEnv("AIVENE_API_KEY", "key");
    vi.stubEnv("OPENROUTER_API_KEY", "fallback-key");
    vi.stubEnv("SCRIPT_PROVIDER", "aivene");
    vi.stubEnv("SCRIPT_FALLBACK_PROVIDER", "openrouter");
    const { loadEnv } = await import("../src/config.js");
    expect(loadEnv()).toMatchObject({
      scriptProvider: "aivene", scriptFallbackProvider: "openrouter", scriptModel: "gemini-3.1-pro"
    });
  });
});
