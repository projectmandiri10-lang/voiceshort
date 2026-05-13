import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiteLlmService } from "../src/services/litellm-service.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("litellm service", () => {
  const logger = pino({ level: "silent" });
  const fetchMock = vi.fn<typeof fetch>();
  let tempDir = "";
  let videoPath = "";

  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    tempDir = await mkdtemp(path.join(os.tmpdir(), "litellm-service-test-"));
    videoPath = path.join(tempDir, "sample.mp4");
    await writeFile(videoPath, "fake-video", "utf8");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uploads video with the expected multipart fields", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "file-123" }));
    const service = new LiteLlmService({
      baseUrl: "http://127.0.0.1:4000/",
      apiKey: "proxy-key",
      scriptModel: "gemini/gemini-3-flash-preview",
      ttsModel: "gemini/gemini-2.5-pro-preview-tts",
      fileTargetModel: "gemini/gemini-3-flash-preview",
      logger
    });

    const uploaded = await service.uploadVideo(videoPath, "video/mp4");

    expect(uploaded).toEqual({
      provider: "litellm",
      fileId: "file-123",
      mimeType: "video/mp4"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4000/v1/files");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer proxy-key");
    const body = init?.body as FormData;
    expect(body.get("purpose")).toBe("user_data");
    expect(body.get("custom_llm_provider")).toBe("gemini");
    expect(body.get("target_model_names")).toBe("gemini/gemini-3-flash-preview");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("normalizes base urls that already include /v1", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "file-123" }));
    const service = new LiteLlmService({
      baseUrl: "http://127.0.0.1:4000/v1/",
      apiKey: "proxy-key",
      scriptModel: "gemini/gemini-3-flash-preview",
      ttsModel: "gemini/gemini-2.5-pro-preview-tts",
      fileTargetModel: "gemini/gemini-3-flash-preview",
      logger
    });

    await service.uploadVideo(videoPath, "video/mp4");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4000/v1/files");
  });

  it("sends multimodal file + text payload for script generation", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: [{ type: "text", text: "Script LiteLLM." }]
            }
          }
        ]
      })
    );
    const service = new LiteLlmService({
      baseUrl: "http://127.0.0.1:4000",
      apiKey: "",
      scriptModel: "gemini/gemini-3-flash-preview",
      ttsModel: "gemini/gemini-2.5-pro-preview-tts",
      fileTargetModel: "gemini/gemini-3-flash-preview",
      logger
    });

    const script = await service.generateScript({
      model: "alias/script-model",
      prompt: "Buat naskah berdasarkan video.",
      video: {
        provider: "litellm",
        fileId: "file-abc",
        mimeType: "video/mp4"
      }
    });

    expect(script).toBe("Script LiteLLM.");
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

  it("requests wav audio from /v1/audio/speech and normalizes legacy gemini tts aliases", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from("wav-audio"), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav"
        }
      })
    );
    const service = new LiteLlmService({
      baseUrl: "http://127.0.0.1:4000",
      apiKey: "",
      scriptModel: "gemini/gemini-3-flash-preview",
      ttsModel: "gemini/gemini-2.5-pro-preview-tts",
      fileTargetModel: "gemini/gemini-3-flash-preview",
      logger
    });

    const audio = await service.generateSpeech({
      model: "gemini/gemini-2.5-pro-preview-tts",
      text: "Halo, ini voice over yang harus terdengar natural.",
      voiceName: "Leda",
      speechRate: 1,
      deliveryHint: "hangat dan meyakinkan"
    });

    expect(audio.data.toString("utf8")).toBe("wav-audio");
    expect(audio.mimeType).toBe("audio/wav");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4000/v1/audio/speech");
    const payload = JSON.parse(String(init?.body || "{}")) as {
      model: string;
      voice: string;
      input: string;
      instructions: string;
      response_format: string;
      speed: number;
    };
    expect(payload.model).toBe("vertex_ai/gemini-2.5-pro-tts");
    expect(payload.voice).toBe("Leda");
    expect(payload.input).toBe("Halo, ini voice over yang harus terdengar natural.");
    expect(payload.instructions).toContain("hangat dan meyakinkan");
    expect(payload.response_format).toBe("wav");
    expect(payload.speed).toBe(1);
  });
});
