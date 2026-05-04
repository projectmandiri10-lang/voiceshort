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
    expect(body.get("target_model_names")).toBe('["gemini/gemini-3-flash-preview"]');
    expect(body.get("file")).toBeInstanceOf(Blob);
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

  it("requests pcm16 audio with natural delivery prompt and decodes the response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              audio: {
                data: Buffer.from("pcm-audio").toString("base64"),
                format: "pcm16"
              }
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

    const audio = await service.generateSpeech({
      model: "alias/tts-model",
      text: "Halo, ini voice over yang harus terdengar natural.",
      voiceName: "Leda",
      speechRate: 1,
      deliveryHint: "hangat dan meyakinkan"
    });

    expect(audio.data.toString("utf8")).toBe("pcm-audio");
    expect(audio.mimeType).toContain("audio/pcm");
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(init?.body || "{}")) as {
      model: string;
      modalities: string[];
      audio: { voice: string; format: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.model).toBe("alias/tts-model");
    expect(payload.modalities).toEqual(["audio"]);
    expect(payload.audio).toEqual({
      voice: "Leda",
      format: "pcm16"
    });
    expect(payload.messages[1]?.content).toContain("Delivery harus natural");
    expect(payload.messages[1]?.content).toContain("hangat dan meyakinkan");
  });
});
