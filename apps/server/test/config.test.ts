import { afterEach, describe, expect, it, vi } from "vitest";

describe("legacy server environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("loads script-only provider settings", async () => {
    vi.stubEnv("AIVENE_API_KEY", "key");
    vi.stubEnv("ZAI_API_KEY", "fallback-key");
    vi.stubEnv("SCRIPT_PROVIDER", "aivene");
    vi.stubEnv("SCRIPT_FALLBACK_PROVIDER", "zai");
    const { loadEnv } = await import("../src/config.js");
    expect(loadEnv()).toMatchObject({
      scriptProvider: "aivene", scriptFallbackProvider: "zai", scriptModel: "gpt-5.4-nano",
      zaiScriptModel: "glm-5v-turbo"
    });
  });
});
