import { describe, expect, it, vi } from "vitest";
import {
  buildFallbackEncodeArgs,
  buildFastMuxArgs,
  executeMuxWithFallback,
  resolveSourceVideoPath,
  resolveUploadedAudioPath
} from "./local-render";
import { calculateAudioFit } from "./shared/speech-timing";

const muxInput = {
  sourceVideoPath: "source.mp4",
  voicePath: "voice.mp3",
  outputVideoPath: "final.mp4",
  targetDurationSec: 36,
  voiceDurationSec: 39
};

describe("local render mux", () => {
  it("preserves supported input extensions", () => {
    expect(["voice.wav", "voice.mp3", "voice.m4a", "voice.mp4", "voice.ogg"].map(resolveUploadedAudioPath)).toEqual([
      "uploaded-voice.wav", "uploaded-voice.mp3", "uploaded-voice.m4a", "uploaded-voice.mp4", "uploaded-voice.ogg"
    ]);
    expect(resolveSourceVideoPath("clip.MOV")).toBe("source.mov");
    expect(resolveSourceVideoPath("clip.mp4")).toBe("source.mp4");
  });

  it("uses stream copy without changing video frames or FPS", () => {
    const args = buildFastMuxArgs(muxInput);
    const command = args.join(" ");
    expect(command).toContain("-c:v copy");
    expect(command).not.toContain("libx264");
    expect(command).not.toContain("scale=");
    expect(command).not.toContain("fps=");
    expect(args).not.toContain("-r");
    expect(command).toContain("atempo=1.089385");
    expect(command).toContain("apad=whole_dur=36.000");
    expect(command).not.toContain("atrim");
  });

  it("uses veryfast fallback while preserving source frame timestamps", () => {
    const args = buildFallbackEncodeArgs(muxInput);
    const command = args.join(" ");
    expect(command).toContain("-c:v libx264");
    expect(command).toContain("-preset veryfast");
    expect(command).toContain("-fps_mode passthrough");
    expect(command).toContain("scale=");
    expect(command).not.toContain("fps=");
    expect(args).not.toContain("-r");
    expect(command).not.toContain("drawtext");
    expect(command).not.toContain("atrim");
  });

  it("returns immediately when fast mux succeeds", async () => {
    const executor = {
      exec: vi.fn(async () => 0),
      deleteFile: vi.fn(async () => true)
    };
    const phases: string[] = [];
    await expect(executeMuxWithFallback(executor, muxInput, (phase) => phases.push(phase))).resolves.toBe("fast_mux");
    expect(executor.exec).toHaveBeenCalledTimes(1);
    expect(executor.deleteFile).not.toHaveBeenCalled();
    expect(phases).toEqual(["fast_mux"]);
  });

  it("cleans failed output and falls back to veryfast encode", async () => {
    const executor = {
      exec: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      deleteFile: vi.fn(async () => true)
    };
    const phases: string[] = [];
    await expect(executeMuxWithFallback(executor, muxInput, (phase) => phases.push(phase))).resolves.toBe("fallback_encode");
    expect(executor.exec).toHaveBeenCalledTimes(2);
    expect(executor.deleteFile).toHaveBeenCalledWith("final.mp4");
    expect(phases).toEqual(["fast_mux", "fallback_encode"]);
    expect(executor.exec.mock.calls[1]?.[0].join(" ")).toContain("-preset veryfast");
  });

  it("throws when both mux paths fail", async () => {
    const executor = {
      exec: vi.fn(async () => 1),
      deleteFile: vi.fn(async () => true)
    };
    await expect(executeMuxWithFallback(executor, muxInput)).rejects.toThrow("Format video tidak dapat diproses menjadi MP4.");
  });

  it("calculates the full-word tempo fit and quality warning", () => {
    const fit = calculateAudioFit(39, 36);
    expect(fit).toMatchObject({ safetyMarginSec: 0.2, speechTargetSec: 35.8, hasQualityWarning: false });
    expect(fit.tempoFactor).toBeCloseTo(1.089385, 6);
    expect(calculateAudioFit(50, 36).hasQualityWarning).toBe(true);
  });
});
