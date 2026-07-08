import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();

vi.mock("./supabase", () => ({
  isSupabaseAuthReady: () => true,
  supabase: {
    auth: {
      getSession: getSessionMock
    }
  }
}));

describe("api error handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123"
        }
      },
      error: null
    });
  });

  it("formats structured provider fallback errors without object stringification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "Visual brief gagal pada provider utama (litellm) dan fallback (openrouter).",
            error: {
              primaryProvider: "litellm",
              fallbackProvider: "openrouter",
              primaryError: "LiteLLM script gagal",
              fallbackError: "OpenRouter script gagal"
            }
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
    );

    const { ApiError, createGenerationSession } = await import("./api");

    let captured: unknown;
    try {
      await createGenerationSession({
        title: "Voice Over Produk",
        description: "Jelaskan produk dengan singkat dan menarik",
        contentType: "affiliate",
        socialPlatform: "instagram",
        contentLanguage: "id-ID",
        scriptMode: "auto_analysis",
        includeSubtitles: false,
        voiceGender: "female",
        tone: "natural",
        videoDurationSec: 42,
        frames: [
          {
            timestampSec: 0,
            mimeType: "image/jpeg",
            base64Data: "frame-one",
            width: 448,
            height: 252
          }
        ]
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(ApiError);
    expect(captured).toMatchObject({
      status: 503,
      message:
        "Visual brief gagal pada provider utama (litellm) dan fallback (openrouter). (Provider utama litellm: LiteLLM script gagal | Provider fallback openrouter: OpenRouter script gagal)"
    });
    expect((captured as Error).message).not.toContain("[object Object]");
  });
});
