import { describe, expect, it, vi } from "vitest";
import { HybridAiService } from "../src/services/hybrid-ai-service.js";

describe("hybrid ai service", () => {
  it("routes content methods to the content service and speech to the speech service", async () => {
    const contentService = {
      uploadVideo: vi.fn(async () => ({
        provider: "snifox" as const,
        fileId: "file-1",
        mimeType: "video/mp4"
      })),
      generateScript: vi.fn(async () => "script-result"),
      generateVisualBrief: vi.fn(async () => ({
        summary: "brief",
        hook: {
          startSec: 0,
          endSec: 1,
          reason: "hook"
        },
        timeline: [],
        mustMention: [],
        mustAvoid: [],
        uncertainties: []
      })),
      generateCaptionMetadata: vi.fn(async () => ({
        caption: "caption-result",
        hashtags: ["#tes"]
      }))
    };
    const speechService = {
      generateSpeech: vi.fn(async () => ({
        data: Buffer.from("audio"),
        mimeType: "audio/wav"
      }))
    };
    const service = new HybridAiService(contentService, speechService);

    const uploaded = await service.uploadVideo("video.mp4", "video/mp4");
    const script = await service.generateScript({
      model: "snifox/model",
      prompt: "buat script"
    });
    const brief = await service.generateVisualBrief({
      model: "snifox/model",
      prompt: "buat brief",
      video: uploaded
    });
    const social = await service.generateCaptionMetadata({
      model: "snifox/model",
      prompt: "buat caption"
    });
    const audio = await service.generateSpeech({
      model: "litellm/tts-model",
      text: "Halo",
      voiceName: "Leda",
      speechRate: 1
    });

    expect(contentService.uploadVideo).toHaveBeenCalledWith("video.mp4", "video/mp4");
    expect(contentService.generateScript).toHaveBeenCalledTimes(1);
    expect(contentService.generateVisualBrief).toHaveBeenCalledTimes(1);
    expect(contentService.generateCaptionMetadata).toHaveBeenCalledTimes(1);
    expect(speechService.generateSpeech).toHaveBeenCalledTimes(1);
    expect(script).toBe("script-result");
    expect(brief.summary).toBe("brief");
    expect(social.caption).toBe("caption-result");
    expect(audio.data.toString("utf8")).toBe("audio");
  });
});
