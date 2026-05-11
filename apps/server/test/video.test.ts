import { describe, expect, it } from "vitest";
import { resolveFfprobeExecutable } from "../src/utils/video.js";

describe("video utils", () => {
  it("prefers FFPROBE_PATH when provided", () => {
    expect(
      resolveFfprobeExecutable({
        fromEnv: "/custom/ffprobe",
        staticPath: "/package/ffprobe",
        exists: () => true
      })
    ).toBe("/custom/ffprobe");
  });

  it("falls back to bundled ffprobe when available", () => {
    expect(
      resolveFfprobeExecutable({
        fromEnv: "",
        staticPath: "/package/ffprobe",
        exists: (filePath) => filePath === "/package/ffprobe"
      })
    ).toBe("/package/ffprobe");
  });

  it("falls back to PATH lookup when no explicit binary is available", () => {
    expect(
      resolveFfprobeExecutable({
        fromEnv: "",
        staticPath: "",
        exists: () => false
      })
    ).toBe("ffprobe");
  });
});
