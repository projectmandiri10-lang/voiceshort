import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args)
}));

function buildProfileRow() {
  return {
    id: "user-1",
    email: "creator@test.dev",
    display_name: "Creator",
    role: "user",
    subscription_status: "active",
    video_quota_total: 10,
    video_quota_used: 2,
    wallet_balance_idr: 16000,
    is_unlimited: false,
    disabled_at: null,
    disabled_reason: null,
    assigned_package_code: null,
    google_linked: false,
    has_password: true,
    created_at: "2026-05-28T07:00:00.000Z",
    updated_at: "2026-05-28T07:10:00.000Z"
  };
}

function buildSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    owner_user_id: "user-1",
    owner_email: "creator@test.dev",
    title: "Judul Session",
    description: "Deskripsi Session",
    content_type: "affiliate",
    voice_gender: "female",
    tone: "natural",
    cta_text: null,
    reference_link: null,
    video_duration_sec: 42,
    frame_count: 12,
    status: "ready_for_render",
    script_text: "Script session",
    caption_text: "Caption session",
    hashtags: ["#tag1"],
    voice_name: "Leda",
    speech_rate: 1,
    charged_amount_idr: 2000,
    error_message: null,
    render_summary: {},
    completed_at: null,
    created_at: "2026-05-28T08:00:00.000Z",
    updated_at: "2026-05-28T08:01:00.000Z",
    ...overrides
  };
}

function buildServiceClient(options?: {
  sessions?: Record<string, unknown>[];
  sessionRow?: Record<string, unknown>;
  insertError?: { message: string };
  updateCollector?: unknown[];
  rpcMock?: ReturnType<typeof vi.fn>;
}) {
  const profileRow = buildProfileRow();
  const settingsRow = null;
  const sessions = options?.sessions || [buildSessionRow()];
  const sessionRow = options?.sessionRow || buildSessionRow();
  const updateCollector = options?.updateCollector || [];
  const rpcMock =
    options?.rpcMock ||
    vi.fn(async () => ({
      data: {},
      error: null
    }));

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            email: "creator@test.dev"
          }
        },
        error: null
      }))
    },
    rpc: rpcMock,
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return {
              data: profileRow,
              error: null
            };
          }
        };
      }

      if (table === "app_settings") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return {
              data: settingsRow,
              error: null
            };
          }
        };
      }

      if (table === "generation_sessions") {
        let listMode = false;
        return {
          select() {
            return this;
          },
          order() {
            listMode = true;
            return this;
          },
          limit() {
            listMode = true;
            return this;
          },
          eq() {
            if (listMode) {
              return Promise.resolve({
                data: sessions,
                error: null
              });
            }
            return this;
          },
          async maybeSingle() {
            return {
              data: sessionRow,
              error: null
            };
          },
          insert() {
            return {
              select() {
                return this;
              },
              async single() {
                if (options?.insertError) {
                  return {
                    data: null,
                    error: options.insertError
                  };
                }
                return {
                  data: buildSessionRow({
                    status: "ready_for_audio"
                  }),
                  error: null
                };
              }
            };
          },
          update(payload: unknown) {
            updateCollector.push(payload);
            return {
              eq() {
                return this;
              },
              select() {
                return this;
              },
              async single() {
                return {
                  data: {
                    ...sessionRow,
                    ...(payload as Record<string, unknown>)
                  },
                  error: null
                };
              }
            };
          },
          then: undefined,
          async [Symbol.asyncIterator]() {
            return undefined;
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    })
  };
}

function geminiTextResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text }]
          }
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

function geminiAudioResponse(base64Audio: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: base64Audio
                }
              }
            ]
          }
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

describe("handleApiRequest", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns public TTS voices without auth", async () => {
    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/tts/voices"),
      {}
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { voices: unknown[] };
    expect(Array.isArray(body.voices)).toBe(true);
    expect(body.voices.length).toBeGreaterThan(0);
  });

  it("rejects protected generation routes when bearer token is missing", async () => {
    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/generation-sessions"),
      {}
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/login terlebih dahulu/i);
  });

  it("lists generation sessions for an authenticated user", async () => {
    createClientMock.mockReturnValue(
      buildServiceClient({
        sessions: [buildSessionRow()]
      })
    );

    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/generation-sessions", {
        headers: {
          Authorization: "Bearer token-123"
        }
      }),
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ sessionId: string }>;
    expect(body[0]?.sessionId).toBe("session-1");
  });

  it("refunds flat generate credit when session insert fails after AI generation", async () => {
    const rpcMock = vi.fn(async (name: string) => {
      if (name === "reserve_generate_credit") {
        return { data: {}, error: null };
      }
      if (name === "refund_generate_credit") {
        return { data: {}, error: null };
      }
      return { data: {}, error: null };
    });

    createClientMock.mockReturnValue(
      buildServiceClient({
        insertError: { message: "insert failed" },
        rpcMock
      })
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        geminiTextResponse(
          JSON.stringify({
            summary: "Ringkasan video",
            hook: {
              startSec: 0,
              endSec: 3,
              reason: "Hook visual"
            },
            timeline: [
              {
                startSec: 0,
                endSec: 3,
                primaryVisual: "Produk dipegang",
                action: "Kamera mendekat",
                onScreenText: ["Promo"],
                narrationFocus: "Sorot produk utama",
                avoidClaims: ["Klaim berlebihan"]
              }
            ],
            mustMention: ["Produk utama"],
            mustAvoid: ["Klaim palsu"],
            uncertainties: ["Merek tidak jelas"]
          })
        )
      )
      .mockResolvedValueOnce(
        geminiTextResponse(JSON.stringify({ script: "Ini naskah singkat untuk video." }))
      )
      .mockResolvedValueOnce(
        geminiTextResponse(
          JSON.stringify({
            caption: "Caption singkat untuk posting.",
            hashtags: ["#produk", "#promo"]
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/generation-sessions", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: "Voice Over Produk",
          description: "Jelaskan produk dengan singkat dan menarik",
          contentType: "affiliate",
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
        })
      }),
      {
        GEMINI_API_KEY: "gemini-key",
        GENERATE_PRICE_IDR: "2500",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(500);
    expect(rpcMock).toHaveBeenCalledWith(
      "reserve_generate_credit",
      expect.objectContaining({
        charge_amount_idr: 2500,
        billed_minutes: 1,
        video_duration_sec: 42
      })
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "refund_generate_credit",
      expect.objectContaining({
        target_user_id: "user-1",
        reason: "Rollback session insert failure"
      })
    );
  });

  it("returns TTS audio and moves the session to ready_for_render", async () => {
    const updates: unknown[] = [];
    createClientMock.mockReturnValue(
      buildServiceClient({
        sessionRow: buildSessionRow({
          status: "ready_for_audio",
          script_text: "Halo, ini script voice over.",
          speech_rate: 1
        }),
        updateCollector: updates
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiAudioResponse(Buffer.from("fakewav").toString("base64")))
    );

    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/generation-sessions/session-1/tts", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123"
        }
      }),
      {
        GEMINI_API_KEY: "gemini-key",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/wav");
    expect(response.headers.get("X-Voice-Name")).toBe("Leda");
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "ready_for_render",
        error_message: null
      })
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("stores local render metadata when a session is completed", async () => {
    const updates: unknown[] = [];
    createClientMock.mockReturnValue(
      buildServiceClient({
        sessionRow: buildSessionRow({
          status: "ready_for_render"
        }),
        updateCollector: updates
      })
    );

    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/generation-sessions/session-1/complete", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          finalDurationSec: 42,
          finalSizeBytes: 5242880,
          localFileName: "voice-over-produk-final.mp4"
        })
      }),
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(200);
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "completed",
        error_message: null
      })
    );
    const body = (await response.json()) as {
      session: { status: string; renderSummary?: { finalSizeBytes?: number } };
    };
    expect(body.session.status).toBe("completed");
    expect(body.session.renderSummary?.finalSizeBytes).toBe(5242880);
  });

  it("marks render failures as retryable worker sessions when requested", async () => {
    const updates: unknown[] = [];
    createClientMock.mockReturnValue(
      buildServiceClient({
        sessionRow: buildSessionRow({
          status: "ready_for_render",
          render_summary: {}
        }),
        updateCollector: updates
      })
    );

    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/generation-sessions/session-1/fail", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason: "Render lokal kehabisan memori",
          retryable: true
        })
      }),
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(200);
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "ready_for_render",
        error_message: null,
        render_summary: expect.objectContaining({
          lastClientError: "Render lokal kehabisan memori"
        })
      })
    );
    const body = (await response.json()) as { session: { status: string } };
    expect(body.session.status).toBe("ready_for_render");
  });
});
