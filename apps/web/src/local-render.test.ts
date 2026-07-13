import { describe, expect, it } from "vitest";
import { buildFinalMuxArgs, resolveUploadedAudioPath } from "./local-render";

describe("buildFinalMuxArgs", () => {
  it("preserves supported uploaded audio extensions for FFmpeg", () => {
    expect(["voice.wav", "voice.mp3", "voice.m4a", "voice.mp4", "voice.ogg"].map(resolveUploadedAudioPath)).toEqual([
      "uploaded-voice.wav", "uploaded-voice.mp3", "uploaded-voice.m4a", "uploaded-voice.mp4", "uploaded-voice.ogg"
    ]);
  });

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

  it("fits large voice duration gaps instead of trimming or padding raw narration", () => {
    const tooShort = buildFinalMuxArgs({
      sourceVideoPath: "source.mp4",
      voiceWavPath: "voice.wav",
      outputVideoPath: "final.mp4",
      targetDurationSec: 40,
      voiceDurationSec: 25
    }).join(" ");
    const tooLong = buildFinalMuxArgs({
      sourceVideoPath: "source.mp4",
      voiceWavPath: "voice.wav",
      outputVideoPath: "final.mp4",
      targetDurationSec: 40,
      voiceDurationSec: 58
    }).join(" ");

    expect(tooShort).toContain("atempo=0.625000");
    expect(tooLong).toContain("atempo=1.450000");
  });

  it("chains tempo filters for extreme uploaded-audio duration gaps", () => {
    const args = buildFinalMuxArgs({
      sourceVideoPath: "source.mp4",
      voiceWavPath: "voice.wav",
      outputVideoPath: "final.mp4",
      targetDurationSec: 60,
      voiceDurationSec: 5
    }).join(" ");

    expect(args.match(/atempo=0\.5/g)).toHaveLength(3);
    expect(args).toContain("atempo=0.666667");
  });
});
