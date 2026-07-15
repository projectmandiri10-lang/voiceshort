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
            message: "Visual brief gagal pada provider utama (aivene) dan fallback (zai).",
            error: {
              primaryProvider: "aivene",
              fallbackProvider: "zai",
              primaryError: "Aivene script gagal",
              fallbackError: "Z.AI script gagal"
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
        "Visual brief gagal pada provider utama (aivene) dan fallback (zai). (Provider utama aivene: Aivene script gagal | Provider fallback zai: Z.AI script gagal)"
    });
    expect((captured as Error).message).not.toContain("[object Object]");
  });
});
