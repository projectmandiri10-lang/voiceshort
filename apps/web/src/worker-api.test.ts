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

function buildDb(
  inserted: unknown[],
  rpcMock: ReturnType<typeof vi.fn>,
  options?: { settingsRow?: Record<string, unknown> | null; superadmin?: boolean; profileOverrides?: Record<string, unknown> }
) {
  let settingsRow = options?.settingsRow ?? null;
  const activeProfile = {
    ...(options?.superadmin ? { ...profile, role: "superadmin" as const } : profile),
    ...(options?.profileOverrides || {})
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1", email: activeProfile.email } }, error: null })) },
    rpc: rpcMock,
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: vi.fn(async () => ({ data: activeProfile, error: null }))
        };
      }
      if (table === "app_settings") {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: vi.fn(async () => ({ data: settingsRow, error: null })),
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            settingsRow = payload;
            return { error: null };
          })
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
                  completed_at: payload.completed_at ?? null
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

function analysisRpcMock(accessType: "free" | "subscription" | "unlimited" = "free") {
  return vi.fn(async (name: string) => {
    if (name === "reserve_analysis_access") {
      return { data: { accessType, freeAnalysisUsed: accessType === "free" ? 1 : 10, freeAnalysisRemaining: accessType === "free" ? 9 : 0 }, error: null };
    }
    if (name === "complete_analysis_access" || name === "release_analysis_access") {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  AIVENE_API_KEY: "aivene-key",
  AIVENE_BASE_URL: "https://api.aivene.com/v1",
  AIVENE_SCRIPT_MODEL: "gpt-4o-mini",
  AIVENE_REASONING_EFFORT: "medium",
  SCRIPT_PROVIDER: "aivene"
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
    const rpcMock = analysisRpcMock();
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
        socialPlatform: "instagram", contentLanguage: "id-ID",
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 42,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), env);

    expect(response.status).toBe(201);
    const body = await response.json() as { session: Record<string, unknown> };
    expect(body.session).toMatchObject({
      status: "completed", chargedAmountIdr: 0,
      sceneText: "Narator Indonesia dengan pace natural; akhiri tepat 42.00 detik.",
      sampleContextText: "Ikuti visual dan jangan menambah intro atau outro.",
      captionText: "Rutinitas praktis setiap hari.", hashtags: ["#produk", "#praktis"]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url) === "https://api.aivene.com/v1/chat/completions")).toBe(true);
    const aiBodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(aiBodies.every((payload) => payload.model === "gpt-4o-mini")).toBe(true);
    expect(aiBodies.every((payload) => !("reasoning_effort" in payload))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("audio/speech"))).toBe(false);
    expect(rpcMock.mock.calls.map(([name]) => name)).toEqual(["reserve_analysis_access", "complete_analysis_access"]);
    expect(inserted[0]).toMatchObject({ status: "completed", charged_amount_idr: 0 });
    expect(inserted[0]).toHaveProperty("completed_at");
    expect(inserted[0]).not.toHaveProperty("voice_name");
    expect(inserted[0]).not.toHaveProperty("speech_rate");
    expect(inserted[0]).not.toHaveProperty("include_subtitles");
    expect(inserted[0]).toMatchObject({
      metadata: {
        polish: {
          attempted: false,
          model: "gemini-3-flash",
          status: "disabled",
          fallbackUsed: false,
          skipReason: "envDisabled"
        }
      }
    });
  });

  it("runs a third text-only Gemini polish step whenever polish is enabled", async () => {
    const inserted: unknown[] = [];
    const rpcMock = analysisRpcMock();
    createClientMock.mockReturnValue(buildDb(inserted, rpcMock));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse({
        summary: "Produk terlihat jelas",
        hook: { startSec: 0, endSec: 3, reason: "Perubahan visual" },
        timeline: [{
          startSec: 0, endSec: 16, primaryVisual: "Produk", action: "Digunakan",
          onScreenText: [], narrationFocus: "Manfaat produk", avoidClaims: []
        }],
        mustMention: ["manfaat"], mustAvoid: ["klaim berlebihan"], uncertainties: []
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural; selesai tepat 16.00 detik.",
        sampleContextText: "Ikuti visual utama dan jangan tambah intro.",
        scriptText: "Produk ini membantu rutinitas harian terasa lebih praktis dan nyaman dipakai, jadi langkah pagi sampai malam tetap rapi, ringan, dan enak diikuti tanpa terasa buru-buru saat dipakai setiap hari di rumah sendiri juga tanpa ribet tambahan.",
        captionText: "Rutinitas praktis setiap hari.",
        hashtags: ["#produk", "#praktis"]
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural dan lebih rapi; selesai tepat 16.00 detik.",
        sampleContextText: "Ikuti visual utama, jaga ritme natural, dan jangan tambah intro.",
        scriptText: "Produk ini membantu rutinitas harian terasa lebih praktis dan nyaman dipakai, jadi langkah pagi sampai malam tetap rapi, ringan, dan enak diikuti tanpa terasa buru-buru setiap hari.",
        captionText: "Rutinitas harian terasa lebih praktis.",
        hashtags: ["#produk", "#praktis", "#harian"]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID",
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 16,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), {
      ...env,
      AIVENE_POLISH_ENABLED: "true",
      AIVENE_POLISH_MODEL: "gemini-3-flash",
      AIVENE_POLISH_REASONING_EFFORT: "medium"
    });

    expect(response.status).toBe(201);
    const body = await response.json() as { session: Record<string, unknown> };
    expect(body.session).toMatchObject({
      sceneText: "Narator Indonesia natural dan lebih rapi; selesai tepat 16.00 detik.",
      captionText: "Rutinitas harian terasa lebih praktis.",
      hashtags: ["#produk", "#praktis", "#harian"],
      metadata: {
        polish: {
          attempted: true,
          model: "gemini-3-flash",
          status: "completed",
          fallbackUsed: false
        }
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const aiBodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(aiBodies[2]).toMatchObject({ model: "gemini-3-flash", reasoning_effort: "medium" });
    const thirdMessage = (aiBodies[2]?.messages as Array<Record<string, unknown>> | undefined)?.[0];
    const thirdContent = Array.isArray(thirdMessage?.content) ? thirdMessage.content as Array<Record<string, unknown>> : [];
    expect(thirdContent.some((part) => part.type === "image_url")).toBe(false);
    expect(inserted[0]).toMatchObject({
      scene_text: "Narator Indonesia natural dan lebih rapi; selesai tepat 16.00 detik.",
      metadata: {
        polish: {
          attempted: true,
          model: "gemini-3-flash",
          status: "completed",
          fallbackUsed: false
        }
      }
    });
  });

  it("keeps the text-only Gemini polish path for short-duration packages", async () => {
    const inserted: unknown[] = [];
    const rpcMock = analysisRpcMock();
    createClientMock.mockReturnValue(buildDb(inserted, rpcMock));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse({
        summary: "Produk terlihat jelas",
        hook: { startSec: 0, endSec: 2, reason: "Perubahan visual" },
        timeline: [{
          startSec: 0, endSec: 10, primaryVisual: "Produk", action: "Digunakan",
          onScreenText: [], narrationFocus: "Manfaat produk", avoidClaims: []
        }],
        mustMention: ["manfaat"], mustAvoid: ["klaim berlebihan"], uncertainties: []
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural; selesai tepat 10.00 detik.",
        sampleContextText: "Ikuti visual utama dan jangan tambah intro.",
        scriptText: "Produk ini praktis dipakai setiap hari.",
        captionText: "Praktis dipakai harian.",
        hashtags: ["#produk", "#praktis"]
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural dengan ritme lebih tertahan; selesai tepat 10.00 detik.",
        sampleContextText: "Ikuti visual utama, isi durasi penuh secara natural, dan jangan tambah intro.",
        scriptText: "Produk ini praktis dipakai setiap hari, jadi rutinitas terasa lebih rapi dan nyaman dijalani.",
        captionText: "Rutinitas harian terasa lebih rapi.",
        hashtags: ["#produk", "#praktis", "#harian"]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID",
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 10,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), {
      ...env,
      AIVENE_POLISH_ENABLED: "true",
      AIVENE_POLISH_MODEL: "gemini-3-flash",
      AIVENE_POLISH_REASONING_EFFORT: "medium"
    });

    expect(response.status).toBe(201);
    const body = await response.json() as { session: Record<string, unknown> };
    expect(body.session).toMatchObject({
      sceneText: "Narator Indonesia natural dengan ritme lebih tertahan; selesai tepat 10.00 detik.",
      captionText: "Rutinitas harian terasa lebih rapi.",
      hashtags: ["#produk", "#praktis", "#harian"],
      metadata: {
        polish: {
          attempted: true,
          model: "gemini-3-flash",
          status: "completed",
          fallbackUsed: false
        }
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const aiBodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(aiBodies[2]).toMatchObject({ model: "gemini-3-flash", reasoning_effort: "medium" });
    const thirdMessage = (aiBodies[2]?.messages as Array<Record<string, unknown>> | undefined)?.[0];
    const thirdContent = Array.isArray(thirdMessage?.content) ? thirdMessage.content as Array<Record<string, unknown>> : [];
    expect(thirdContent.some((part) => part.type === "image_url")).toBe(false);
    expect(inserted[0]).toMatchObject({
      scene_text: "Narator Indonesia natural dengan ritme lebih tertahan; selesai tepat 10.00 detik.",
      metadata: {
        polish: {
          attempted: true,
          model: "gemini-3-flash",
          status: "completed",
          fallbackUsed: false
        }
      }
    });
  });

  it("falls back to the original AI Studio package when Gemini polish fails", async () => {
    const inserted: unknown[] = [];
    const rpcMock = analysisRpcMock();
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
        sceneText: "Narator Indonesia natural; selesai tepat 42.00 detik.",
        sampleContextText: "Ikuti visual utama dan jangan tambah intro.",
        scriptText: "Produk ini membantu rutinitas harian menjadi lebih praktis.",
        captionText: "Rutinitas praktis setiap hari.",
        hashtags: ["#produk", "#praktis"]
      }))
      .mockImplementation(async () => new Response(JSON.stringify({
        error: { message: "Gemini polish unavailable" }
      }), { status: 503, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID",
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 10,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), {
      ...env,
      AIVENE_POLISH_ENABLED: "true",
      AIVENE_POLISH_MODEL: "gemini-3-flash"
    });

    expect(response.status).toBe(201);
    const body = await response.json() as { session: Record<string, unknown> };
    expect(body.session).toMatchObject({
      sceneText: "Narator Indonesia natural; selesai tepat 42.00 detik.",
      metadata: {
        polish: {
          attempted: true,
          model: "gemini-3-flash",
          status: "fallback",
          fallbackUsed: true,
          errorMessage: "Gemini polish unavailable"
        }
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(inserted[0]).toMatchObject({
      scene_text: "Narator Indonesia natural; selesai tepat 42.00 detik.",
      metadata: {
        polish: {
          attempted: true,
          model: "gemini-3-flash",
          status: "fallback",
          fallbackUsed: true,
          errorMessage: "Gemini polish unavailable"
        }
      }
    });
  });

  it("enforces the Shopee caption limit on the final polished package", async () => {
    const inserted: unknown[] = [];
    const rpcMock = analysisRpcMock();
    createClientMock.mockReturnValue(buildDb(inserted, rpcMock));
    const longCaption = "Shopee " + "hemat banget ".repeat(20);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse({
        summary: "Produk terlihat jelas",
        hook: { startSec: 0, endSec: 3, reason: "Perubahan visual" },
        timeline: [{
          startSec: 0, endSec: 20, primaryVisual: "Produk", action: "Digunakan",
          onScreenText: [], narrationFocus: "Manfaat produk", avoidClaims: []
        }],
        mustMention: ["manfaat"], mustAvoid: ["klaim berlebihan"], uncertainties: []
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural; selesai tepat 20.00 detik.",
        sampleContextText: "Ikuti visual utama dan jangan tambah intro.",
        scriptText: "Produk ini membantu rutinitas harian terasa lebih praktis dan nyaman dipakai setiap hari.",
        captionText: longCaption,
        hashtags: ["#produk", "#praktis"]
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural dan rapi; selesai tepat 20.00 detik.",
        sampleContextText: "Ikuti visual utama, jaga ritme natural, dan jangan tambah intro.",
        scriptText: "Produk ini membantu rutinitas harian terasa lebih praktis dan nyaman dipakai setiap hari.",
        captionText: longCaption,
        hashtags: ["#produk", "#praktis", "#shopee"]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
        socialPlatform: "shopee", contentLanguage: "id-ID",
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 20,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), {
      ...env,
      AIVENE_POLISH_ENABLED: "true",
      AIVENE_POLISH_MODEL: "gemini-3-flash",
      AIVENE_POLISH_REASONING_EFFORT: "medium"
    });

    expect(response.status).toBe(201);
    const body = await response.json() as { session: Record<string, unknown> };
    expect(String(body.session.captionText || "").length).toBeLessThanOrEqual(150);
    expect(String((inserted[0] as Record<string, unknown>).caption_text || "").length).toBeLessThanOrEqual(150);
  });

  it("keeps the CTA intact at the end when a long polished script would otherwise cut it off", async () => {
    const inserted: unknown[] = [];
    const rpcMock = analysisRpcMock();
    createClientMock.mockReturnValue(buildDb(inserted, rpcMock));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse({
        summary: "Produk terlihat jelas",
        hook: { startSec: 0, endSec: 3, reason: "Perubahan visual" },
        timeline: [{
          startSec: 0, endSec: 10, primaryVisual: "Produk", action: "Digunakan",
          onScreenText: [], narrationFocus: "Manfaat produk", avoidClaims: []
        }],
        mustMention: ["manfaat"], mustAvoid: ["klaim berlebihan"], uncertainties: []
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural; selesai tepat 10.00 detik.",
        sampleContextText: "Ikuti visual utama dan jangan tambah intro.",
        scriptText: "Produk ini praktis dipakai setiap hari, nyaman, ringan, dan mudah masuk ke rutinitas.",
        captionText: "Praktis dipakai harian.",
        hashtags: ["#produk", "#praktis"]
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Narator Indonesia natural dan rapi; selesai tepat 10.00 detik.",
        sampleContextText: "Ikuti visual utama, jaga ritme natural, dan jangan tambah intro.",
        scriptText: "Produk ini praktis dipakai setiap hari, nyaman, ringan, mudah masuk ke rutinitas, enak diikuti dari pagi sampai malam, dan terasa simpel untuk digunakan terus. Cek di keranjang sekarang tambahan lagi",
        captionText: "Rutinitas harian terasa lebih rapi.",
        hashtags: ["#produk", "#praktis", "#harian"]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID",
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 10,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), {
      ...env,
      AIVENE_POLISH_ENABLED: "true",
      AIVENE_POLISH_MODEL: "gemini-3-flash",
      AIVENE_POLISH_REASONING_EFFORT: "medium"
    });

    expect(response.status).toBe(201);
    const body = await response.json() as { session: Record<string, unknown> };
    expect(String(body.session.scriptText || "").endsWith("Cek di keranjang sekarang")).toBe(true);
    expect(String(body.session.scriptText || "").includes("tambahan lagi")).toBe(false);
    expect(String((inserted[0] as Record<string, unknown>).script_text || "").endsWith("Cek di keranjang sekarang")).toBe(true);
  });

  it("uses wallet credit after 10 free analyses are exhausted", async () => {
    const inserted: unknown[] = [];
    const rpcMock = vi.fn(async (name: string) => {
      if (name === "reserve_analysis_access") {
        return { data: null, error: { message: "FREE_ANALYSIS_LIMIT_REACHED" } };
      }
      if (name === "reserve_generate_credit" || name === "complete_analysis_access") {
        return { data: null, error: null };
      }
      if (name === "release_analysis_access" || name === "refund_generate_credit") {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });
    createClientMock.mockReturnValue(buildDb(inserted, rpcMock, {
      profileOverrides: {
        subscription_status: "inactive",
        wallet_balance_idr: 2000,
        free_analysis_used: 10
      },
      settingsRow: {
        settings_key: "default",
        script_provider: "aivene",
        script_fallback_provider: "aivene",
        script_model: "gpt-4o-mini",
        tax_rate_percent: 0,
        language: "id-ID",
        max_video_seconds: 60,
        safety_mode: "safe_marketing",
        concurrency: 1
      }
    }));
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
        sceneText: "Narator santai dengan pace natural.",
        sampleContextText: "Ikuti visual utama.",
        scriptText: "Produk ini cocok dipakai setiap hari.",
        captionText: "Cocok untuk kebutuhan harian.",
        hashtags: ["#produk"]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi produk", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID",
        tone: "natural", referenceLink: "https://example.com/produk", videoDurationSec: 42,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), env);

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const aiBodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(aiBodies.every((payload) => payload.model === "gpt-4o-mini")).toBe(true);
    expect(rpcMock.mock.calls.map(([name]) => name)).toEqual([
      "reserve_analysis_access",
      "reserve_generate_credit",
      "complete_analysis_access"
    ]);
    expect(inserted[0]).toMatchObject({ charged_amount_idr: 1000 });
  });

  it("keeps superadmin analysis on Aivene when the primary request fails", async () => {
    const inserted: unknown[] = [];
    createClientMock.mockReturnValue(buildDb(inserted, analysisRpcMock("unlimited"), { superadmin: true }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Aivene unavailable" }
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID", tone: "natural",
        videoDurationSec: 42,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), env);

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.aivene.com/v1/chat/completions");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api.z.ai"))).toBe(false);
  });

  it("never sends a subscribed user directly to Z.AI when Aivene fails", async () => {
    const inserted: unknown[] = [];
    const rpcMock = analysisRpcMock("subscription");
    createClientMock.mockReturnValue(buildDb(inserted, rpcMock, {
      settingsRow: {
        settings_key: "default", script_provider: "aivene", script_fallback_provider: "aivene",
        script_model: "gpt-4o-mini", language: "id-ID", max_video_seconds: 60,
        safety_mode: "safe_marketing", concurrency: 1
      }
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Aivene unavailable" }
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");

    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi", contentType: "affiliate",
        socialPlatform: "instagram", contentLanguage: "id-ID", tone: "natural",
        videoDurationSec: 42,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), env);

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.aivene.com/v1/chat/completions");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api.z.ai"))).toBe(false);
    expect(rpcMock.mock.calls.map(([name]) => name)).toEqual(["reserve_analysis_access", "release_analysis_access"]);
  });

  it("uses the admin-selected model for subscribed users", async () => {
    const inserted: unknown[] = [];
    createClientMock.mockReturnValue(buildDb(inserted, analysisRpcMock("subscription"), {
      settingsRow: {
        settings_key: "default", script_provider: "aivene", script_fallback_provider: "aivene",
        script_model: "gpt-4o-mini", language: "id-ID", max_video_seconds: 60,
        safety_mode: "safe_marketing", concurrency: 1
      }
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse({
        summary: "Produk", hook: { startSec: 0, endSec: 3, reason: "Hook" },
        timeline: [{ startSec: 0, endSec: 42, primaryVisual: "Produk", action: "Dipakai", onScreenText: [], narrationFocus: "Produk", avoidClaims: [] }],
        mustMention: [], mustAvoid: [], uncertainties: []
      }))
      .mockResolvedValueOnce(chatResponse({
        sceneText: "Scene", sampleContextText: "Context", scriptText: "Naskah produk.",
        captionText: "Caption", hashtags: ["#produk"]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi", contentType: "affiliate", socialPlatform: "instagram",
        contentLanguage: "id-ID", tone: "natural", videoDurationSec: 42,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), env);
    expect(response.status).toBe(201);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(bodies.every((body) => body.model === "gpt-4o-mini")).toBe(true);
  });

  it("blocks the eleventh free analysis before calling a provider", async () => {
    const rpcMock = vi.fn(async (name: string) => {
      if (name === "reserve_analysis_access") {
        return { data: null, error: { message: "FREE_ANALYSIS_LIMIT_REACHED" } };
      }
      if (name === "reserve_generate_credit") {
        return { data: null, error: { message: "Saldo deposit tidak cukup." } };
      }
      return { data: null, error: null };
    });
    createClientMock.mockReturnValue(buildDb([], rpcMock));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(new Request("https://app.test/api/generation-sessions", {
      method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Produk", description: "Deskripsi", contentType: "affiliate", socialPlatform: "instagram",
        contentLanguage: "id-ID", tone: "natural", videoDurationSec: 42,
        frames: [{ timestampSec: 0, mimeType: "image/jpeg", base64Data: "frame", width: 448, height: 252 }]
      })
    }), env);
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ message: expect.stringContaining("10 naskah gratis") });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("persists an admin model selection and returns the saved model instead of the env default", async () => {
    const initialSettings = {
      settings_key: "default",
      script_provider: "aivene",
      script_fallback_provider: "aivene",
      script_model: "gpt-4o-mini",
      tax_rate_percent: 0,
      language: "id-ID",
      max_video_seconds: 60,
      safety_mode: "safe_marketing",
      concurrency: 1
    };
    createClientMock.mockReturnValue(buildDb([], vi.fn(), { settingsRow: initialSettings, superadmin: true }));
    const { handleApiRequest } = await import("./worker-api");
    const payload = {
      scriptProvider: "aivene",
      scriptFallbackProvider: "aivene",
      scriptModel: "gpt-4o-mini",
      taxRatePercent: 0,
      language: "id-ID",
      maxVideoSeconds: 60,
      safetyMode: "safe_marketing",
      concurrency: 1
    };

    const response = await handleApiRequest(new Request("https://app.test/api/settings", {
      method: "PUT",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scriptProvider: "aivene",
      scriptFallbackProvider: "aivene",
      scriptModel: "gpt-4o-mini"
    });

    const getResponse = await handleApiRequest(new Request("https://app.test/api/settings", {
      headers: { Authorization: "Bearer token" }
    }), env);
    await expect(getResponse.json()).resolves.toMatchObject({ scriptModel: "gpt-4o-mini" });
  });
});
