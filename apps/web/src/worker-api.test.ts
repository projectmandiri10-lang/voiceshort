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
    social_platform: "instagram",
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
  settingsRow?: Record<string, unknown> | null;
  insertError?: { message: string };
  updateCollector?: unknown[];
  rpcMock?: ReturnType<typeof vi.fn>;
}) {
  const profileRow = buildProfileRow();
  const settingsRow = options?.settingsRow ?? null;
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

function openRouterAudioResponse(audioBytes: string): Response {
  return new Response(Buffer.from(audioBytes), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg"
    }
  });
}

function openRouterTextResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: text
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

function liteLlmTextResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: text
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

function geminiAudioResponse(audioText: string, mimeType = "audio/wav"): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: Buffer.from(audioText, "utf8").toString("base64"),
                  mimeType
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
        liteLlmTextResponse(
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
        liteLlmTextResponse(JSON.stringify({ script: "Ini naskah singkat untuk video." }))
      )
      .mockResolvedValueOnce(
        liteLlmTextResponse(
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
          socialPlatform: "instagram",
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
        LITELLM_BASE_URL: "https://litellm.example/v1",
        LITELLM_API_KEY: "litellm-key",
        OPENROUTER_API_KEY: "openrouter-key",
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

  it("supports OpenRouter as the script provider for visual brief, script, and caption", async () => {
    const rpcMock = vi.fn(async () => ({ data: {}, error: null }));
    createClientMock.mockReturnValue(
      buildServiceClient({
        rpcMock,
        settingsRow: {
          settings_key: "default",
          script_provider: "openrouter",
          script_fallback_provider: "gemini_direct",
          script_model: "google/gemini-2.5-flash-lite",
          tts_provider: "openrouter",
          tts_fallback_provider: "gemini_direct",
          tts_model: "google/gemini-3.1-flash-tts-preview",
          language: "id-ID",
          max_video_seconds: 60,
          safety_mode: "safe_marketing",
          concurrency: 1,
          gender_voices: [
            { gender: "male", voiceName: "Charon", speechRate: 1 },
            { gender: "female", voiceName: "Leda", speechRate: 1 }
          ]
        }
      })
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        openRouterTextResponse(
          JSON.stringify({
            summary: "Ringkasan visual",
            hook: { startSec: 0, endSec: 2, reason: "Hook awal" },
            timeline: [
              {
                startSec: 0,
                endSec: 2,
                primaryVisual: "Produk terlihat",
                action: "Kamera maju",
                onScreenText: ["Promo"],
                narrationFocus: "Sorot produk",
                avoidClaims: ["Klaim palsu"]
              }
            ],
            mustMention: ["produk"],
            mustAvoid: ["klaim palsu"],
            uncertainties: []
          })
        )
      )
      .mockResolvedValueOnce(
        openRouterTextResponse(JSON.stringify({ script: "Ini script dari OpenRouter." }))
      )
      .mockResolvedValueOnce(
        openRouterTextResponse(
          JSON.stringify({
            caption: "Caption dari OpenRouter.",
            hashtags: ["#openrouter", "#voiceshort"]
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
          socialPlatform: "instagram",
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
        OPENROUTER_API_KEY: "openrouter-key",
        GENERATE_PRICE_IDR: "2000",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    }
  });

  it("supports LiteLLM as the script provider for visual brief, script, and caption", async () => {
    const rpcMock = vi.fn(async () => ({ data: {}, error: null }));
    createClientMock.mockReturnValue(
      buildServiceClient({
        rpcMock,
        settingsRow: {
          settings_key: "default",
          script_provider: "litellm",
          script_fallback_provider: "openrouter",
          script_model: "gemini-2.5-flash-lite",
          tts_provider: "openrouter",
          tts_fallback_provider: "gemini_direct",
          tts_model: "google/gemini-3.1-flash-tts-preview",
          language: "id-ID",
          max_video_seconds: 60,
          safety_mode: "safe_marketing",
          concurrency: 1,
          gender_voices: [
            { gender: "male", voiceName: "Charon", speechRate: 1 },
            { gender: "female", voiceName: "Leda", speechRate: 1 }
          ]
        }
      })
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        liteLlmTextResponse(
          JSON.stringify({
            summary: "Ringkasan visual LiteLLM",
            hook: { startSec: 0, endSec: 2, reason: "Hook awal" },
            timeline: [
              {
                startSec: 0,
                endSec: 2,
                primaryVisual: "Produk terlihat",
                action: "Kamera maju",
                onScreenText: ["Promo"],
                narrationFocus: "Sorot produk",
                avoidClaims: ["Klaim palsu"]
              }
            ],
            mustMention: ["produk"],
            mustAvoid: ["klaim palsu"],
            uncertainties: []
          })
        )
      )
      .mockResolvedValueOnce(
        liteLlmTextResponse(JSON.stringify({ script: "Ini script dari LiteLLM." }))
      )
      .mockResolvedValueOnce(
        liteLlmTextResponse(
          JSON.stringify({
            caption: "Caption dari LiteLLM.",
            hashtags: ["#litellm", "#voiceshort"]
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
          socialPlatform: "instagram",
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
        LITELLM_BASE_URL: "https://litellm.example/v1",
        LITELLM_API_KEY: "litellm-key",
        OPENROUTER_API_KEY: "openrouter-key",
        GENERATE_PRICE_IDR: "2000",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(init.headers).toMatchObject({
        Authorization: "Bearer litellm-key"
      });
      const payload = JSON.parse(String(init.body));
      expect(payload.model).toBe("gemini/gemini-2.5-flash-lite");
    }
    const firstPayload = JSON.parse(
      String(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1] || {}).body)
    );
    expect(firstPayload.messages[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({
          type: "image_url",
          image_url: expect.objectContaining({
            url: expect.stringContaining("data:image/jpeg;base64,frame-one")
          })
        })
      ])
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://litellm.example/v1/chat/completions",
      "https://litellm.example/v1/chat/completions",
      "https://litellm.example/v1/chat/completions"
    ]);
  });

  it("falls back to OpenRouter text generation when LiteLLM script calls fail", async () => {
    const rpcMock = vi.fn(async () => ({ data: {}, error: null }));
    createClientMock.mockReturnValue(
      buildServiceClient({
        rpcMock,
        settingsRow: {
          settings_key: "default",
          script_provider: "litellm",
          script_fallback_provider: "openrouter",
          script_model: "gemini-2.5-flash-lite",
          tts_provider: "openrouter",
          tts_fallback_provider: "gemini_direct",
          tts_model: "google/gemini-3.1-flash-tts-preview",
          language: "id-ID",
          max_video_seconds: 60,
          safety_mode: "safe_marketing",
          concurrency: 1,
          gender_voices: [
            { gender: "male", voiceName: "Charon", speechRate: 1 },
            { gender: "female", voiceName: "Leda", speechRate: 1 }
          ]
        }
      })
    );

    let openRouterStage = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("litellm.example")) {
        return new Response(JSON.stringify({ error: { message: "LiteLLM utama gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      openRouterStage += 1;
      return openRouterTextResponse(
        JSON.stringify(
          openRouterStage === 1
            ? {
                summary: "Ringkasan visual fallback",
                hook: { startSec: 0, endSec: 2, reason: "Hook awal" },
                timeline: [
                  {
                    startSec: 0,
                    endSec: 2,
                    primaryVisual: "Produk terlihat",
                    action: "Kamera maju",
                    onScreenText: ["Promo"],
                    narrationFocus: "Sorot produk",
                    avoidClaims: ["Klaim palsu"]
                  }
                ],
                mustMention: ["produk"],
                mustAvoid: ["klaim palsu"],
                uncertainties: []
              }
            : openRouterStage === 2
              ? { script: "Script fallback dari OpenRouter." }
              : {
                  caption: "Caption fallback dari OpenRouter.",
                  hashtags: ["#fallback", "#voiceshort"]
                }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
          socialPlatform: "instagram",
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
        LITELLM_BASE_URL: "https://litellm.example/v1",
        LITELLM_API_KEY: "litellm-key",
        OPENROUTER_API_KEY: "openrouter-key",
        GENERATE_PRICE_IDR: "2000",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(201);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("litellm.example"))).toHaveLength(9);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("openrouter.ai/api/v1/chat/completions"))).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns a clear provider error when LiteLLM script primary and OpenRouter fallback both fail", async () => {
    const rpcMock = vi.fn(async () => ({ data: {}, error: null }));
    createClientMock.mockReturnValue(
      buildServiceClient({
        rpcMock,
        settingsRow: {
          settings_key: "default",
          script_provider: "litellm",
          script_fallback_provider: "openrouter",
          script_model: "gemini-2.5-flash-lite",
          tts_provider: "openrouter",
          tts_fallback_provider: "gemini_direct",
          tts_model: "google/gemini-3.1-flash-tts-preview",
          language: "id-ID",
          max_video_seconds: 60,
          safety_mode: "safe_marketing",
          concurrency: 1,
          gender_voices: [
            { gender: "male", voiceName: "Charon", speechRate: 1 },
            { gender: "female", voiceName: "Leda", speechRate: 1 }
          ]
        }
      })
    );

    const fetchMock = vi.fn(async (url: string) => {
      const message = url.includes("litellm.example")
        ? "LiteLLM script gagal"
        : "OpenRouter script gagal";
      return new Response(JSON.stringify({ error: { message } }), {
        status: 503,
        headers: {
          "Content-Type": "application/json"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

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
          socialPlatform: "instagram",
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
        LITELLM_BASE_URL: "https://litellm.example/v1",
        LITELLM_API_KEY: "litellm-key",
        OPENROUTER_API_KEY: "openrouter-key",
        GENERATE_PRICE_IDR: "2000",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      message: string;
      error?: Record<string, string>;
    };
    expect(body.message).toContain(
      "Visual brief gagal pada provider utama (litellm) dan fallback (openrouter)."
    );
    expect(body.error).toMatchObject({
      primaryProvider: "litellm",
      fallbackProvider: "openrouter"
    });
  });

  it("falls back to OpenRouter text generation when Gemini direct script calls fail", async () => {
    const rpcMock = vi.fn(async () => ({ data: {}, error: null }));
    createClientMock.mockReturnValue(
      buildServiceClient({
        rpcMock,
        settingsRow: {
          settings_key: "default",
          script_provider: "gemini_direct",
          script_fallback_provider: "openrouter",
          script_model: "gemini-2.5-flash-lite",
          tts_provider: "openrouter",
          tts_fallback_provider: "gemini_direct",
          tts_model: "google/gemini-3.1-flash-tts-preview",
          language: "id-ID",
          max_video_seconds: 60,
          safety_mode: "safe_marketing",
          concurrency: 1,
          gender_voices: [
            { gender: "male", voiceName: "Charon", speechRate: 1 },
            { gender: "female", voiceName: "Leda", speechRate: 1 }
          ]
        }
      })
    );

    let openRouterStage = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: { message: "Gemini utama gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      openRouterStage += 1;
      return openRouterTextResponse(
        JSON.stringify(
          openRouterStage === 1
            ? {
                summary: "Ringkasan visual fallback",
                hook: { startSec: 0, endSec: 2, reason: "Hook awal" },
                timeline: [
                  {
                    startSec: 0,
                    endSec: 2,
                    primaryVisual: "Produk terlihat",
                    action: "Kamera maju",
                    onScreenText: ["Promo"],
                    narrationFocus: "Sorot produk",
                    avoidClaims: ["Klaim palsu"]
                  }
                ],
                mustMention: ["produk"],
                mustAvoid: ["klaim palsu"],
                uncertainties: []
              }
            : openRouterStage === 2
              ? { script: "Script fallback dari OpenRouter." }
              : {
                  caption: "Caption fallback dari OpenRouter.",
                  hashtags: ["#fallback", "#voiceshort"]
                }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
          socialPlatform: "instagram",
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
        OPENROUTER_API_KEY: "openrouter-key",
        GENERATE_PRICE_IDR: "2000",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(201);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("generativelanguage.googleapis.com"))).toHaveLength(9);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("openrouter.ai/api/v1/chat/completions"))).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalled();
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
    const fetchMock = vi.fn(async () => openRouterAudioResponse("fakeaudio"));
    vi.stubGlobal("fetch", fetchMock);

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
        OPENROUTER_API_KEY: "openrouter-key",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("X-Voice-Name")).toBe("Leda");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openrouter-key"
        })
      })
    );
    const init = ((fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined)?.[1] || {}) as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "google/gemini-3.1-flash-tts-preview",
      voice: "Leda",
      response_format: "mp3",
      speed: 1
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "ready_for_render",
        error_message: null
      })
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("falls back to Gemini direct for voice preview when OpenRouter TTS fails", async () => {
    createClientMock.mockReturnValue(
      buildServiceClient({
        settingsRow: {
          settings_key: "default",
          script_provider: "gemini_direct",
          script_fallback_provider: "openrouter",
          script_model: "gemini-2.5-flash-lite",
          tts_provider: "openrouter",
          tts_fallback_provider: "gemini_direct",
          tts_model: "google/gemini-3.1-flash-tts-preview",
          language: "id-ID",
          max_video_seconds: 60,
          safety_mode: "safe_marketing",
          concurrency: 1,
          gender_voices: [
            { gender: "male", voiceName: "Charon", speechRate: 1 },
            { gender: "female", voiceName: "Leda", speechRate: 1 }
          ]
        }
      })
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "OpenRouter TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "OpenRouter TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "OpenRouter TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(geminiAudioResponse("fallback-audio"));
    vi.stubGlobal("fetch", fetchMock);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/tts/preview", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          voiceName: "Leda",
          text: "Halo, ini preview fallback.",
          speechRate: 1
        })
      }),
      {
        GEMINI_API_KEY: "gemini-key",
        OPENROUTER_API_KEY: "openrouter-key",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/wav");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("openrouter.ai/api/v1/audio/speech"))).toHaveLength(3);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("generativelanguage.googleapis.com"))).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("returns a clear provider error when TTS preview primary and fallback both fail", async () => {
    createClientMock.mockReturnValue(buildServiceClient());
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "OpenRouter TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "OpenRouter TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "OpenRouter TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Gemini direct TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Gemini direct TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Gemini direct TTS gagal" } }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { handleApiRequest } = await import("./worker-api");
    const response = await handleApiRequest(
      new Request("https://voiceshort.example/api/tts/preview", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          voiceName: "Leda",
          text: "Halo, ini preview gagal.",
          speechRate: 1
        })
      }),
      {
        GEMINI_API_KEY: "gemini-key",
        OPENROUTER_API_KEY: "openrouter-key",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      message: string;
      error?: Record<string, string>;
    };
    expect(body.message).toContain("Voice preview TTS gagal pada provider utama (openrouter) dan fallback (gemini_direct).");
    expect(body.error).toMatchObject({
      primaryProvider: "openrouter",
      fallbackProvider: "gemini_direct"
    });
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
