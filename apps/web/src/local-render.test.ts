import { describe, expect, it } from "vitest";
import { buildFinalMuxArgs } from "./local-render";

describe("buildFinalMuxArgs", () => {
  it("builds a browser ffmpeg pipeline with video compression and audio fit", () => {
    const args = buildFinalMuxArgs({
      sourceVideoPath: "source.mp4",
      voiceWavPath: "voice.wav",
      outputVideoPath: "final.mp4",
      targetDurationSec: 42,
      voiceDurationSec: 44
    });

    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("libx264");
    expect(args.join(" ")).toContain("loudnorm");
    expect(args[args.length - 1]).toBe("final.mp4");
  });

  it("adds subtitle drawtext filters when subtitle text is enabled", () => {
    const args = buildFinalMuxArgs({
      sourceVideoPath: "source.mp4",
      voiceWavPath: "voice.wav",
      outputVideoPath: "final.mp4",
      targetDurationSec: 42,
      voiceDurationSec: 42,
      subtitleText: "Ini subtitle contoh untuk video pendek yang akan dibagi otomatis."
    });

    expect(args.join(" ")).toContain("drawtext=");
    expect(args.join(" ")).toContain("between(t,");
  });
});
