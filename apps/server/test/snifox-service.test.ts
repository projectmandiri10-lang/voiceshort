import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnifoxService } from "../src/services/snifox-service.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("snifox service", () => {
  const logger = pino({ level: "silent" });
  const fetchMock = vi.fn<typeof fetch>();
  let tempDir = "";
  let videoPath = "";

  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    tempDir = await mkdtemp(path.join(os.tmpdir(), "snifox-service-test-"));
    videoPath = path.join(tempDir, "sample.mp4");
    await writeFile(videoPath, "fake-video", "utf8");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uploads video without LiteLLM-specific multipart fields", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "file-snifox-123" }));
    const service = new SnifoxService({
      baseUrl: "http://127.0.0.1:8000/",
      apiKey: "snifox-key",
      scriptModel: "gemini/gemini-3-flash-preview",
      logger
    });

    const uploaded = await service.uploadVideo(videoPath, "video/mp4");

    expect(uploaded).toEqual({
      provider: "snifox",
      fileId: "file-snifox-123",
      mimeType: "video/mp4"
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8000/v1/files");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer snifox-key");
    const body = init?.body as FormData;
    expect(body.get("purpose")).toBe("user_data");
    expect(body.get("custom_llm_provider")).toBeNull();
    expect(body.get("target_model_names")).toBeNull();
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("sends multimodal file + text payload for script generation", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: [{ type: "text", text: "Script Snifox." }]
            }
          }
        ]
      })
    );
    const service = new SnifoxService({
      baseUrl: "http://127.0.0.1:8000",
      apiKey: "",
      scriptModel: "gemini/gemini-3-flash-preview",
      logger
    });

    const script = await service.generateScript({
      model: "alias/script-model",
      prompt: "Buat naskah berdasarkan video.",
      video: {
        provider: "snifox",
        fileId: "file-abc",
        mimeType: "video/mp4"
      }
    });

    expect(script).toBe("Script Snifox.");
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(init?.body || "{}")) as {
      model: string;
      messages: Array<{
        role: string;
        content: Array<{
          type: string;
          text?: string;
          file?: { file_id: string };
        }>;
      }>;
    };
    expect(payload.model).toBe("alias/script-model");
    expect(payload.messages[0]?.content).toEqual([
      {
        type: "file",
        file: {
          file_id: "file-abc"
        }
      },
      {
        type: "text",
        text: "Buat naskah berdasarkan video."
      }
    ]);
  });

  it("parses visual brief JSON response through the shared extractor flow", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    summary: "Visual meja kerja berubah rapi.",
                    hook: {
                      startSec: 0,
                      endSec: 2,
                      reason: "Perubahan terlihat cepat."
                    },
                    timeline: [
                      {
                        startSec: 0,
                        endSec: 2,
                        primaryVisual: "Meja kerja",
                        action: "Menjadi rapi",
                        onScreenText: [],
                        narrationFocus: "Perubahan visual utama",
                        avoidClaims: []
                      }
                    ],
                    mustMention: ["meja rapi"],
                    mustAvoid: ["klaim palsu"],
                    uncertainties: []
                  })
                }
              ]
            }
          }
        ]
      })
    );
    const service = new SnifoxService({
      baseUrl: "http://127.0.0.1:8000",
      apiKey: "",
      scriptModel: "gemini/gemini-3-flash-preview",
      logger
    });

    const brief = await service.generateVisualBrief({
      model: "alias/script-model",
      prompt: "Analisis video ini.",
      video: {
        provider: "snifox",
        fileId: "file-visual",
        mimeType: "video/mp4"
      }
    });

    expect(brief.summary).toBe("Visual meja kerja berubah rapi.");
    expect(brief.hook.reason).toBe("Perubahan terlihat cepat.");
  });
});
