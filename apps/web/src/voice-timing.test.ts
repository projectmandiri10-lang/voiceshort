import { describe, expect, it } from "vitest";
import { isVoiceDurationAligned, needsScriptRetiming } from "./voice-timing";

describe("voice timing", () => {
  it("accepts a tightly aligned voice duration", () => {
    expect(isVoiceDurationAligned(42.15, 42)).toBe(true);
  });

  it("retimes scripts only when a natural local tempo correction is insufficient", () => {
    expect(needsScriptRetiming(44, 42)).toBe(false);
    expect(needsScriptRetiming(31, 42)).toBe(true);
    expect(needsScriptRetiming(54, 42)).toBe(true);
  });
});
