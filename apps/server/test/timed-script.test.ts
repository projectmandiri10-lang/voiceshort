import { describe, expect, it } from "vitest";
import {
  parseTimedVoiceSegments,
  timedVoiceSegmentsToScript
} from "../src/utils/timed-script.js";

describe("timed script utils", () => {
  it("parses timed voice segments from fenced json", () => {
    const segments = parseTimedVoiceSegments(
      `\`\`\`json
{
  "segments": [
    {
      "startSec": 0.4,
      "endSec": 3.2,
      "text": "Ini hook pembuka."
    },
    {
      "startSec": 5,
      "endSec": 8.5,
      "text": "Lanjut saat produk mulai dipakai."
    }
  ]
}
\`\`\``,
      10
    );

    expect(segments).toEqual([
      {
        startSec: 0.4,
        endSec: 3.2,
        text: "Ini hook pembuka."
      },
      {
        startSec: 5,
        endSec: 8.5,
        text: "Lanjut saat produk mulai dipakai."
      }
    ]);
  });

  it("clamps overlapping and out-of-range segments", () => {
    const segments = parseTimedVoiceSegments(
      JSON.stringify({
        segments: [
          { startSec: 2, endSec: 4, text: "Segmen pertama." },
          { startSec: 3, endSec: 6, text: "Segmen kedua." },
          { startSec: 9, endSec: 14, text: "Segmen akhir." }
        ]
      }),
      10
    );

    expect(segments).toEqual([
      { startSec: 2, endSec: 4, text: "Segmen pertama." },
      { startSec: 4, endSec: 6, text: "Segmen kedua." },
      { startSec: 9, endSec: 10, text: "Segmen akhir." }
    ]);
  });

  it("formats timed segments back into caption-friendly script text", () => {
    expect(
      timedVoiceSegmentsToScript([
        { startSec: 0, endSec: 2, text: "Kalimat satu." },
        { startSec: 4, endSec: 6, text: "Kalimat dua." }
      ])
    ).toBe("Kalimat satu. Kalimat dua.");
  });
});
