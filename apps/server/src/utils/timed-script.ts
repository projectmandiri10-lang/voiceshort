import type { TimedVoiceSegment } from "../types.js";

function stripCodeFence(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  const lines = trimmed.split("\n");
  if (lines.length <= 2) {
    return trimmed.replace(/```/g, "").trim();
  }
  return lines.slice(1, lines[lines.length - 1]?.startsWith("```") ? -1 : undefined).join("\n").trim();
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function sanitizeSegmentText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampSeconds(value: number, maxDurationSec: number): number {
  return Number(Math.max(0, Math.min(maxDurationSec, value)).toFixed(2));
}

function normalizeSegment(raw: unknown, targetDurationSec: number): TimedVoiceSegment | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const item = raw as Record<string, unknown>;
  const start = toFiniteNumber(item.startSec);
  const end = toFiniteNumber(item.endSec);
  const text = sanitizeSegmentText(item.text);

  if (start === undefined || end === undefined || !text) {
    return undefined;
  }

  const startSec = clampSeconds(start, targetDurationSec);
  const endSec = clampSeconds(end, targetDurationSec);
  if (endSec - startSec < 0.4) {
    return undefined;
  }

  return {
    startSec,
    endSec,
    text
  };
}

export function parseTimedVoiceSegments(
  raw: string,
  targetDurationSec: number
): TimedVoiceSegment[] {
  const stripped = stripCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return [];
  }

  const sourceSegments =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).segments
      : parsed;
  if (!Array.isArray(sourceSegments)) {
    return [];
  }

  const target = Math.max(1, targetDurationSec);
  const sorted = sourceSegments
    .map((segment) => normalizeSegment(segment, target))
    .filter((segment): segment is TimedVoiceSegment => Boolean(segment))
    .sort((left, right) => left.startSec - right.startSec);

  const result: TimedVoiceSegment[] = [];
  for (const segment of sorted) {
    const previous = result[result.length - 1];
    const startSec = previous ? Math.max(segment.startSec, previous.endSec) : segment.startSec;
    const endSec = Math.max(startSec, segment.endSec);
    if (endSec - startSec < 0.4) {
      continue;
    }
    result.push({
      ...segment,
      startSec: Number(startSec.toFixed(2)),
      endSec: Number(endSec.toFixed(2))
    });
  }

  return result;
}

export function timedVoiceSegmentsToScript(segments: TimedVoiceSegment[]): string {
  return segments.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
}
