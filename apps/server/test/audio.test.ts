import { describe, expect, it } from "vitest";
import {
  FINAL_AUDIO_BITRATE,
  FINAL_AUDIO_SAMPLE_RATE,
  FINAL_VIDEO_CRF,
  FINAL_VIDEO_FPS,
  FINAL_VIDEO_MAX_DIMENSION,
  buildFinalVideoFfmpegArgs,
  buildTimedVoiceOverFfmpegArgs
} from "../src/utils/audio.js";

describe("audio utils", () => {
  it("builds balanced final video compression args", () => {
    const args = buildFinalVideoFfmpegArgs({
      sourceVideoPath: "/tmp/source.mp4",
      voiceWavPath: "/tmp/voice.wav",
      outputVideoPath: "/tmp/final.mp4",
      targetDurationSec: 90,
      voiceDurationSec: 92
    });

    expect(args).toContain("-filter_complex");
    expect(args).toContain("libx264");
    expect(args).toContain("medium");
    expect(args).toContain(String(FINAL_VIDEO_CRF));
    expect(args).toContain("+faststart");
    expect(args).toContain(FINAL_AUDIO_BITRATE);
    expect(args).toContain(String(FINAL_AUDIO_SAMPLE_RATE));
    expect(args).toContain("[vout]");
    expect(args).toContain("[aout]");

    const filterGraph = args[args.indexOf("-filter_complex") + 1];
    expect(filterGraph).toContain(`[0:v:0]fps=${FINAL_VIDEO_FPS}`);
    expect(filterGraph).toContain(String(FINAL_VIDEO_MAX_DIMENSION));
    expect(filterGraph).toContain("setsar=1");
    expect(filterGraph).toContain("atempo=");
    expect(filterGraph).toContain("apad=pad_dur=90.000");
  });

  it("skips tempo adjustment when voice duration already matches target", () => {
    const args = buildFinalVideoFfmpegArgs({
      sourceVideoPath: "/tmp/source.mp4",
      voiceWavPath: "/tmp/voice.wav",
      outputVideoPath: "/tmp/final.mp4",
      targetDurationSec: 30,
      voiceDurationSec: 30.05
    });

    const filterGraph = args[args.indexOf("-filter_complex") + 1];
    expect(filterGraph).not.toContain("atempo=");
    expect(filterGraph).toContain("atrim=0:30.000");
  });

  it("builds timed voice-over args with delayed narration segments", () => {
    const args = buildTimedVoiceOverFfmpegArgs({
      outputPath: "/tmp/voice.wav",
      targetDurationSec: 12,
      segments: [
        {
          audioPath: "/tmp/segment-1.wav",
          startSec: 1.2,
          endSec: 3.4
        },
        {
          audioPath: "/tmp/segment-2.wav",
          startSec: 7,
          endSec: 9.5
        }
      ]
    });

    expect(args).toContain("/tmp/segment-1.wav");
    expect(args).toContain("/tmp/segment-2.wav");
    const filterGraph = args[args.indexOf("-filter_complex") + 1];
    expect(filterGraph).toContain("adelay=1200|1200");
    expect(filterGraph).toContain("adelay=7000|7000");
    expect(filterGraph).toContain("amix=inputs=3");
    expect(filterGraph).toContain("atrim=0:12.000");
  });
});
