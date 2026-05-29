import type { VisualBrief, VisualBriefTimelineItem } from "../types";

function stripCodeFence(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  const lines = trimmed.split("\n");
  if (lines.length <= 2) {
    return trimmed.replace(/```/g, "").trim();
  }
  const withoutFence = lines.slice(1, lines[lines.length - 1]?.startsWith("```") ? -1 : undefined);
  return withoutFence.join("\n").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseJsonScript(raw: string): string | undefined {
  const object = parseJsonObject(raw);
  if (object && typeof object.script === "string") {
    return object.script.trim();
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") {
      return parsed.trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function sanitizeCaption(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
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

function normalizeSeconds(value: unknown, fallback = 0): number {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    return fallback;
  }
  return Math.max(0, Number(parsed.toFixed(2)));
}

function sanitizeTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeCaption(String(item ?? "")))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const single = sanitizeCaption(value);
    return single ? [single] : [];
  }
  return [];
}

function normalizeTimelineItem(raw: unknown): VisualBriefTimelineItem | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const item = raw as Record<string, unknown>;
  const startSec = normalizeSeconds(item.startSec);
  const endSec = normalizeSeconds(item.endSec, startSec);
  const primaryVisual = sanitizeCaption(String(item.primaryVisual ?? ""));
  const action = sanitizeCaption(String(item.action ?? ""));
  const narrationFocus = sanitizeCaption(String(item.narrationFocus ?? ""));

  if (!primaryVisual || !action || !narrationFocus) {
    return undefined;
  }

  return {
    startSec,
    endSec: Math.max(startSec, endSec),
    primaryVisual,
    action,
    onScreenText: sanitizeTextList(item.onScreenText),
    narrationFocus,
    avoidClaims: sanitizeTextList(item.avoidClaims)
  };
}

function normalizeVisualBrief(raw: Record<string, unknown>): VisualBrief | undefined {
  const summary = sanitizeCaption(String(raw.summary ?? ""));
  const timeline = Array.isArray(raw.timeline)
    ? raw.timeline
        .map(normalizeTimelineItem)
        .filter((value): value is VisualBriefTimelineItem => Boolean(value))
    : [];

  if (!summary || !timeline.length) {
    return undefined;
  }

  const sortedTimeline = [...timeline].sort((left, right) => left.startSec - right.startSec);
  const hookSource =
    raw.hook && typeof raw.hook === "object" && !Array.isArray(raw.hook)
      ? (raw.hook as Record<string, unknown>)
      : {};
  const firstBeat = sortedTimeline[0];
  if (!firstBeat) {
    return undefined;
  }
  const fallbackHookReason = firstBeat.narrationFocus || firstBeat.primaryVisual;

  return {
    summary,
    hook: {
      startSec: normalizeSeconds(hookSource.startSec, firstBeat.startSec),
      endSec: Math.max(
        normalizeSeconds(hookSource.startSec, firstBeat.startSec),
        normalizeSeconds(hookSource.endSec, firstBeat.endSec)
      ),
      reason: sanitizeCaption(String(hookSource.reason ?? "")) || fallbackHookReason
    },
    timeline: sortedTimeline,
    mustMention: sanitizeTextList(raw.mustMention),
    mustAvoid: sanitizeTextList(raw.mustAvoid),
    uncertainties: sanitizeTextList(raw.uncertainties)
  };
}

function normalizeHashtag(tag: string): string | undefined {
  const cleaned = tag.replace(/[^\w#]/g, "").trim();
  if (!cleaned) {
    return undefined;
  }
  const withHash = cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
  return withHash.length >= 2 ? withHash.toLowerCase() : undefined;
}

function sanitizeHashtags(raw: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const normalized = normalizeHashtag(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= 12) {
      break;
    }
  }
  return result;
}

function extractHashtagsFromText(text: string): string[] {
  const matches = text.match(/#[a-zA-Z0-9_]+/g) ?? [];
  return sanitizeHashtags(matches);
}

export function extractTextFromGeminiResponse(response: Record<string, unknown>): string {
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  if (!candidates.length) {
    return "";
  }

  const content = (candidates[0] as { content?: { parts?: Array<{ text?: string }> } }).content;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractScriptText(response: Record<string, unknown>): string {
  const raw = extractTextFromGeminiResponse(response);
  if (!raw) {
    return "";
  }
  const stripped = stripCodeFence(raw);
  const fromJson = parseJsonScript(stripped);
  if (fromJson) {
    return fromJson;
  }
  return stripped
    .replace(/\[.*?scene.*?\]/gi, "")
    .replace(/\(.*?scene.*?\)/gi, "")
    .trim();
}

export function extractVisualBrief(response: Record<string, unknown>): VisualBrief {
  const raw = extractTextFromGeminiResponse(response);
  if (!raw) {
    throw new Error("Visual brief kosong.");
  }

  const object = parseJsonObject(stripCodeFence(raw));
  if (!object) {
    throw new Error("Visual brief tidak berupa JSON object yang valid.");
  }

  const visualBrief = normalizeVisualBrief(object);
  if (!visualBrief) {
    throw new Error("Visual brief tidak memenuhi struktur minimal.");
  }

  return visualBrief;
}

export function extractSocialMetadata(response: Record<string, unknown>): {
  caption: string;
  hashtags: string[];
} {
  const raw = extractTextFromGeminiResponse(response);
  const stripped = stripCodeFence(raw);
  const json = parseJsonObject(stripped);
  if (json) {
    const caption = sanitizeCaption(String(json.caption ?? ""));
    const fromArray = Array.isArray(json.hashtags)
      ? sanitizeHashtags(json.hashtags.map((item) => String(item)))
      : [];
    const fromCaption = extractHashtagsFromText(caption);
    return {
      caption: caption.replace(/#[a-zA-Z0-9_]+/g, "").replace(/\s+/g, " ").trim(),
      hashtags: fromArray.length ? fromArray : fromCaption
    };
  }

  const lines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const captionLine = lines.find((line) => !line.startsWith("#")) ?? stripped;
  const caption = sanitizeCaption(captionLine).replace(/#[a-zA-Z0-9_]+/g, "").trim();
  return { caption, hashtags: extractHashtagsFromText(stripped) };
}

export function ensureWavAudio(data: Uint8Array, mimeType: string): Uint8Array {
  const normalized = mimeType.toLowerCase();
  const isPcm =
    normalized.includes("l16") ||
    normalized.includes("raw") ||
    normalized.includes("pcm");
  if (!isPcm) {
    return data;
  }

  const sampleRate = 24000;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + data.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, data.length, true);

  const result = new Uint8Array(44 + data.length);
  result.set(new Uint8Array(header), 0);
  result.set(data, 44);
  return result;
}
