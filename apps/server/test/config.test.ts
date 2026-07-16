import { afterEach, describe, expect, it, vi } from "vitest";

describe("legacy server environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("loads script-only provider settings", async () => {
    vi.stubEnv("AIVENE_API_KEY", "key");
    vi.stubEnv("SCRIPT_PROVIDER", "aivene");
    const { loadEnv } = await import("../src/config.js");
    expect(loadEnv()).toMatchObject({
      scriptProvider: "aivene", scriptFallbackProvider: "aivene", scriptModel: "gpt-4o-mini"
    });
  });
});
