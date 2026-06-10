import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();
const uploadMock = vi.fn();
const getFileMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: generateContentMock
    },
    files: {
      upload: uploadMock,
      get: getFileMock
    }
  }))
}));

import { GeminiService } from "../src/services/gemini-service.js";

describe("gemini service", () => {
  const logger = pino({ level: "silent" });

  beforeEach(() => {
    generateContentMock.mockReset();
    uploadMock.mockReset();
    getFileMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts fileData before prompt text for multimodal visual-brief calls", async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
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
    });

    const service = new GeminiService("test-gemini-key", "test-openrouter-key", logger);
    await service.generateVisualBrief({
      model: "gemini-test",
      prompt: "Analisis video ini.",
      video: {
        provider: "gemini",
        fileUri: "mock://video",
        mimeType: "video/mp4"
      }
    });

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const payload = generateContentMock.mock.calls[0][0];
    expect(payload.contents[0].parts).toEqual([
      {
        fileData: {
          fileUri: "mock://video",
          mimeType: "video/mp4"
        }
      },
      { text: "Analisis video ini." }
    ]);
  });

  it("waits until uploaded files become ACTIVE", async () => {
    uploadMock.mockResolvedValueOnce({
      name: "files/123",
      uri: "mock://video",
      mimeType: "video/mp4"
    });
    getFileMock
      .mockResolvedValueOnce({ state: "PROCESSING" })
      .mockResolvedValueOnce({ state: "ACTIVE" });

    const service = new GeminiService("test-gemini-key", "test-openrouter-key", logger);
    const uploaded = await service.uploadVideo("C:/temp/source.mp4", "video/mp4");

    expect(uploaded).toEqual({
      provider: "gemini",
      fileUri: "mock://video",
      mimeType: "video/mp4"
    });
    expect(uploadMock).toHaveBeenCalledWith({
      file: "C:/temp/source.mp4",
      config: {
        mimeType: "video/mp4"
      }
    });
    expect(getFileMock).toHaveBeenCalledTimes(2);
    expect(getFileMock).toHaveBeenLastCalledWith({ name: "files/123" });
  });

  it("retries visual brief with strict json prompt when first response is invalid", async () => {
    generateContentMock
      .mockResolvedValueOnce({
        text: "Ringkasan biasa tanpa JSON"
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
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
      });

    const service = new GeminiService("test-gemini-key", "test-openrouter-key", logger);
    const brief = await service.generateVisualBrief({
      model: "gemini-test",
      prompt: "Analisis video ini.",
      video: {
        provider: "gemini",
        fileUri: "mock://video",
        mimeType: "video/mp4"
      }
    });

    expect(brief.summary).toBe("Video meja kerja dirapikan.");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    const strictPrompt = generateContentMock.mock.calls[1][0].contents[0].parts[1].text;
    expect(strictPrompt).toContain("Kembalikan hanya JSON valid");
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

    const service = new GeminiService("test-gemini-key", "test-openrouter-key", logger);
    const audio = await service.generateSpeech({
      model: "gemini-2.5-flash-preview-tts",
      text: "Halo semua, ini contoh voice over singkat.",
      voiceName: "Leda",
      speechRate: 1.15,
      deliveryHint: "hangat dan meyakinkan"
    });

    expect(audio.data.toString("utf8")).toBe("audio");
    expect(audio.mimeType).toBe("audio/mpeg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
});
