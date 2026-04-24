import pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();
const uploadMock = vi.fn();
const getFileMock = vi.fn();

vi.mock("@google/genai/node", () => ({
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

    const service = new GeminiService("test-key", logger);
    await service.generateVisualBrief({
      model: "gemini-test",
      prompt: "Analisis video ini.",
      video: {
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

    const service = new GeminiService("test-key", logger);
    const brief = await service.generateVisualBrief({
      model: "gemini-test",
      prompt: "Analisis video ini.",
      video: {
        fileUri: "mock://video",
        mimeType: "video/mp4"
      }
    });

    expect(brief.summary).toBe("Video meja kerja dirapikan.");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    const strictPrompt = generateContentMock.mock.calls[1][0].contents[0].parts[1].text;
    expect(strictPrompt).toContain("Kembalikan hanya JSON valid");
  });
});
