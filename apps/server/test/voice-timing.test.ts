import { describe, expect, it } from "vitest";
import {
  calculateAdjustedSpeechRate,
  countWords,
  isVoiceDurationAligned
} from "../src/utils/voice-timing.js";

describe("voice timing utils", () => {
  it("accepts small duration drift as aligned", () => {
    expect(isVoiceDurationAligned(29.78, 30)).toBe(true);
    expect(isVoiceDurationAligned(30.31, 30)).toBe(true);
  });

  it("rejects large duration drift", () => {
    expect(isVoiceDurationAligned(33, 30)).toBe(false);
  });

  it("computes a small speech-rate correction when the mismatch is still safe", () => {
    expect(
      calculateAdjustedSpeechRate({
        currentDurationSec: 30.9,
        targetDurationSec: 30,
        currentSpeechRate: 1
      })
    ).toBe(1.03);
  });

  it("avoids aggressive local rate changes", () => {
    expect(
      calculateAdjustedSpeechRate({
        currentDurationSec: 36,
        targetDurationSec: 30,
        currentSpeechRate: 1
      })
    ).toBeUndefined();
  });

  it("counts words from natural script text", () => {
    expect(countWords("Halo  ini   voice over singkat.")).toBe(5);
  });
});
