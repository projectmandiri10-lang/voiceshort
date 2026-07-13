import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const readFileMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args)
}));

import { GeminiService } from "../src/services/gemini-service.js";

function createService(logger: pino.Logger) {
  return new GeminiService(
    "test-aivene-key",
    "https://api.aivene.test/v1",
    "test-openrouter-key",
    logger
  );
}

function openAiTextResponse(text: string): Response {
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

describe("gemini service", () => {
  const logger = pino({ level: "silent" });

  beforeEach(() => {
    fetchMock.mockReset();
    readFileMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads legacy fallback videos as base64 payloads", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("video-bytes"));

    const service = createService(logger);
    const uploaded = await service.uploadVideo("C:/temp/source.mp4", "video/mp4");

    expect(uploaded).toEqual({
      provider: "gemini",
      mimeType: "video/mp4",
      base64Data: Buffer.from("video-bytes").toString("base64")
    });
  });

  it("sends input_video content to aivene for visual brief calls", async () => {
    fetchMock.mockResolvedValueOnce(
      openAiTextResponse(
        JSON.stringify({
          summary: "Video meja kerja dirapikan.",
          hook: {
            startSec: 0,
            endSec: 2,
            reason: "Perubahan visual paling kuat di awal."
          },
          timeline: [
            {
              startSec: 0,
              endSec: 2,
              primaryVisual: "Meja kerja berantakan",
              action: "Kamera menyorot kondisi awal",
              onScreenText: [],
              narrationFocus: "Masalah yang langsung kelihatan",
              avoidClaims: ["Jangan klaim merek"]
            }
          ],
          mustMention: ["perubahan meja"],
          mustAvoid: ["klaim tidak terlihat"],
          uncertainties: []
        })
      )
    );

    const service = createService(logger);
    await service.generateVisualBrief({
      provider: "aivene",
      fallbackProvider: "openrouter",
      model: "gemini-2.5-flash",
      prompt: "Analisis video ini.",
      video: {
        provider: "gemini",
        base64Data: Buffer.from("video-bytes").toString("base64"),
        mimeType: "video/mp4"
      }
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(payload.messages[0]?.content).toEqual([
      { type: "text", text: "Analisis video ini." },
      {
        type: "input_video",
        input_video: {
          data: Buffer.from("video-bytes").toString("base64"),
          format: "mp4"
        }
      }
    ]);
  });

  it("retries visual brief with strict json prompt when first response is invalid", async () => {
    fetchMock
      .mockResolvedValueOnce(openAiTextResponse("Ringkasan biasa tanpa JSON"))
      .mockResolvedValueOnce(
        openAiTextResponse(
          JSON.stringify({
            summary: "Video meja kerja dirapikan.",
            hook: {
              startSec: 0,
              endSec: 2,
              reason: "Perubahan visual paling kuat di awal."
            },
            timeline: [
              {
                startSec: 0,
                endSec: 2,
                primaryVisual: "Meja kerja berantakan",
                action: "Kamera menyorot kondisi awal",
                onScreenText: [],
                narrationFocus: "Masalah yang langsung kelihatan",
                avoidClaims: ["Jangan klaim merek"]
              }
            ],
            mustMention: ["perubahan meja"],
            mustAvoid: ["klaim tidak terlihat"],
            uncertainties: []
          })
        )
      );

    const service = createService(logger);
    const brief = await service.generateVisualBrief({
      provider: "aivene",
      fallbackProvider: "openrouter",
      model: "gemini-2.5-flash",
      prompt: "Analisis video ini.",
      video: {
        provider: "gemini",
        fileUri: "https://example.test/video.mp4",
        mimeType: "video/mp4"
      }
    });

    expect(brief.summary).toBe("Video meja kerja dirapikan.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondPayload = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as {
      messages: Array<{ content: Array<{ text?: string }> }>;
    };
    expect(secondPayload.messages[0]?.content[0]?.text).toContain("Kembalikan hanya JSON valid");
  });

  it("falls back to OpenRouter text generation when aivene fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Aivene text gagal"
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Aivene text gagal"
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Aivene text gagal"
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
      .mockResolvedValueOnce(
        openAiTextResponse(
          JSON.stringify({
            script: "Script fallback dari OpenRouter."
          })
        )
      );

    const service = createService(logger);
    const result = await service.generateScript({
      provider: "aivene",
      fallbackProvider: "openrouter",
      model: "gemini-2.5-flash",
      prompt: "Tulis script singkat."
    });

    expect(result).toBe("Script fallback dari OpenRouter.");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.aivene.test/v1/chat/completions");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.aivene.test/v1/chat/completions");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://api.aivene.test/v1/chat/completions");
    expect(fetchMock.mock.calls[3]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("sends OpenRouter TTS requests with normalized Gemini model slugs", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from("audio"), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg"
        }
      })
    );

    const service = createService(logger);
    const audio = await service.generateSpeech({
      provider: "openrouter",
      fallbackProvider: "aivene",
      model: "gemini-2.5-flash-preview-tts",
      text: "Halo semua, ini contoh voice over singkat.",
      voiceName: "Leda",
      speechRate: 1.15,
      deliveryHint: "hangat dan meyakinkan"
    });

    expect(audio.data.toString("utf8")).toBe("audio");
    expect(audio.mimeType).toBe("audio/mpeg");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-openrouter-key",
      "Content-Type": "application/json"
    });
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      model: "google/gemini-3.1-flash-tts-preview",
      input: "Halo semua, ini contoh voice over singkat.",
      voice: "Leda",
      response_format: "mp3",
      speed: 1.15
    });
  });

  it("sends Aivene TTS requests with native model ids", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from("aivene-audio"), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg"
        }
      })
    );

    const service = createService(logger);
    const audio = await service.generateSpeech({
      provider: "aivene",
      fallbackProvider: "openrouter",
      model: "tts-1-hd",
      text: "Halo semua, ini contoh Aivene TTS.",
      voiceName: "nova",
      speechRate: 1,
      deliveryHint: "jelas dan natural"
    });

    expect(audio.data.toString("utf8")).toBe("aivene-audio");
    expect(audio.mimeType).toBe("audio/mpeg");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.aivene.test/v1/audio/speech");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-aivene-key",
      "Content-Type": "application/json"
    });
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      model: "tts-1-hd",
      input: "Halo semua, ini contoh Aivene TTS.",
      voice: "nova",
      response_format: "mp3",
      speed: 1
    });
  });
});
