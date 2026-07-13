import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args)
}));

const profile = {
  id: "user-1", email: "creator@test.dev", display_name: "Creator", role: "user",
  subscription_status: "active", video_quota_total: 0, video_quota_used: 0,
  wallet_balance_idr: 0, is_unlimited: false, disabled_at: null, disabled_reason: null,
  assigned_package_code: null, google_linked: false, has_password: true,
  created_at: "2026-07-13T10:00:00Z", updated_at: "2026-07-13T10:00:00Z"
};

function buildDb(inserted: unknown[], rpcMock: ReturnType<typeof vi.fn>) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", email: profile.email } }, error: null })) },
    rpc: rpcMock,
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: vi.fn(async () => ({ data: profile, error: null }))
        };
      }
      if (table === "app_settings") {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: vi.fn(async () => ({ data: null, error: null }))
        };
      }
      if (table === "generation_sessions") {
        return {
          insert(payload: Record<string, unknown>) {
            inserted.push(payload);
            return {
              select() { return this; },
              single: vi.fn(async () => ({
                data: {
                  ...payload,
                  created_at: "2026-07-13T10:00:00Z",
                  updated_at: "2026-07-13T10:00:00Z",
                  completed_at: null
                },
                error: null
              }))
            };
          }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    })
  };
}

function chatResponse(content: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(content) } }] }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
}

const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  AIVENE_API_KEY: "aivene-key",
  AIVENE_BASE_URL: "https://api.aivene.com/v1",
  AIVENE_SCRIPT_MODEL: "gemini-3.1-pro",
  SCRIPT_PROVIDER: "aivene",
  SCRIPT_FALLBACK_PROVIDER: "openrouter"
};

describe("generation session Worker workflow", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses exactly two text calls, stores the AI Studio package, and never charges balance", async () => {
    const inserted: unknown[] = [];
    const rpcMock = vi.fn();
    createClientMock.mockReturnValue(buildDb(inserted, rpcMock));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse({
        summary: "Produk terlihat jelas",
        hook: { startSec: 0, endSec: 3, reason: "Perubahan visual" },
        timeline: [{
          startSec: 0, endSec: 42, primaryVisual: "Produk", action: "Digunakan",
          onScreenText: [], narrationFocus: "Manfaat produk", avoidClaims: []
        }],
        mustMention: ["manfaat"], mustAvoid: ["klaim berlebihan"], uncertainties: []
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia dengan pace natural; akhiri tepat 42.00 detik.",
        sampleContextText: "Ikuti visual dan jangan menambah intro atau outro.",
        scriptText: "Produk ini membantu rutinitas harian menjadi lebih praktis.",
        captionText: "Rutinitas praktis setiap hari.",
        hashtags: ["#Produk", "praktis"]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID", includeSubtitles: true,
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 42,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), env);

    expect(response.status).toBe(201);
    const body = await response.json() as { session: Record<string, unknown> };
    expect(body.session).toMatchObject({
      status: "ready_for_voice_upload", chargedAmountIdr: 0,
      sceneText: "Narator Indonesia dengan pace natural; akhiri tepat 42.00 detik.",
      sampleContextText: "Ikuti visual dan jangan menambah intro atau outro.",
      captionText: "Rutinitas praktis setiap hari.", hashtags: ["#produk", "#praktis"]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url) === "https://api.aivene.com/v1/chat/completions")).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("audio/speech"))).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: "ready_for_voice_upload", charged_amount_idr: 0 });
    expect(inserted[0]).not.toHaveProperty("voice_name");
    expect(inserted[0]).not.toHaveProperty("speech_rate");
  });

  it("does not expose removed audio endpoints", async () => {
    createClientMock.mockReturnValue(buildDb([], vi.fn()));
    const { handleApiRequest } = await import("./worker-api");
    for (const path of ["/api/tts/voices", "/api/tts/preview", "/api/generation-sessions/session-1/tts", "/api/generation-sessions/session-1/retime"]) {
      const response = await handleApiRequest(new Request(`https://app.test${path}`, {
        method: path.endsWith("voices") ? "GET" : "POST", headers: { Authorization: "Bearer token" }
      }), env);
      expect(response.status).toBe(404);
    }
  });
});
