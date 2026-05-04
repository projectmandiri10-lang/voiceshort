import type { VisualBrief, VisualBriefTimelineItem } from "../types.js";

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
  if (object) {
    const maybeScript = object.script;
    if (typeof maybeScript === "string") {
      return maybeScript.trim();
    }
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
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text;
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

function isTimelineItem(value: VisualBriefTimelineItem | undefined): value is VisualBriefTimelineItem {
  return Boolean(value);
}

function normalizeVisualBrief(raw: Record<string, unknown>): VisualBrief | undefined {
  const summary = sanitizeCaption(String(raw.summary ?? ""));
  const timeline = Array.isArray(raw.timeline)
    ? raw.timeline.map(normalizeTimelineItem).filter(isTimelineItem)
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
  if (withHash.length < 2) {
    return undefined;
  }
  return withHash.toLowerCase();
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

export function extractSocialMetadata(response: unknown): {
  caption: string;
  hashtags: string[];
} {
  const raw = extractTextFromResponse(response);
  const stripped = stripCodeFence(raw);
  const json = parseJsonObject(stripped);
  if (json) {
    const caption = sanitizeCaption(String(json.caption ?? ""));
    const hashtagsValue = json.hashtags;
    const fromArray = Array.isArray(hashtagsValue)
      ? sanitizeHashtags(hashtagsValue.map((item) => String(item)))
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
  const hashtags = extractHashtagsFromText(stripped);
  return { caption, hashtags };
}

export function ensureSocialMetadata(
  candidate: { caption: string; hashtags: string[] },
  fallbackCaption: string,
  fallbackHashtags: string[]
): { caption: string; hashtags: string[] } {
  const caption = sanitizeCaption(candidate.caption) || sanitizeCaption(fallbackCaption);
  const hashtags = sanitizeHashtags(candidate.hashtags);
  if (hashtags.length) {
    return { caption, hashtags };
  }
  return {
    caption,
    hashtags: sanitizeHashtags(fallbackHashtags)
  };
}

export function formatSocialMetadataFile(metadata: {
  caption: string;
  hashtags: string[];
}): string {
  const caption = sanitizeCaption(metadata.caption);
  const hashtags = sanitizeHashtags(metadata.hashtags);
  if (!hashtags.length) {
    return `${caption}\n`;
  }
  return `${caption}\n\n${hashtags.join(" ")}\n`;
}

export function extractTextFromResponse(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const maybeText = (response as { text?: unknown }).text;
  if (typeof maybeText === "string") {
    return maybeText.trim();
  }
  if (typeof maybeText === "function") {
    const value = maybeText();
    if (typeof value === "string") {
      return value.trim();
    }
  }

  const choices = (response as { choices?: unknown[] }).choices;
  if (Array.isArray(choices) && choices.length) {
    const message = (choices[0] as {
      message?: {
        content?:
          | string
          | Array<{
              type?: string;
              text?: string;
            }>;
      };
    })?.message;

    if (typeof message?.content === "string") {
      return message.content.trim();
    }

    if (Array.isArray(message?.content)) {
      const texts = message.content
        .map((part) => {
          if (typeof part?.text === "string") {
            return part.text.trim();
          }
          return "";
        })
        .filter(Boolean);

      if (texts.length) {
        return texts.join("\n").trim();
      }
    }
  }

  const candidates = (response as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || !candidates.length) {
    return "";
  }

  const parts =
    (candidates[0] as { content?: { parts?: Array<{ text?: string }> } })?.content?.parts ??
    [];
  const texts = parts
    .map((part) => part.text)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0);
  return texts.join("\n").trim();
}

export function extractScriptText(response: unknown): string {
  const raw = extractTextFromResponse(response);
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

export function extractVisualBrief(response: unknown): VisualBrief {
  const raw = extractTextFromResponse(response);
  if (!raw) {
    throw new Error("Visual brief kosong.");
  }

  const stripped = stripCodeFence(raw);
  const object = parseJsonObject(stripped);
  if (!object) {
    throw new Error("Visual brief tidak berupa JSON object yang valid.");
  }

  const visualBrief = normalizeVisualBrief(object);
  if (!visualBrief) {
    throw new Error("Visual brief tidak memenuhi struktur minimal.");
  }

  return visualBrief;
}

export interface ExtractedAudio {
  data: Buffer;
  mimeType: string;
}

export function extractAudioFromResponse(response: unknown): ExtractedAudio {
  const choices = (response as { choices?: unknown[] })?.choices;
  if (Array.isArray(choices) && choices.length) {
    const message = (choices[0] as {
      message?: {
        audio?: {
          data?: string;
          format?: string;
          mime_type?: string;
        };
      };
    })?.message;

    if (message?.audio?.data) {
      const format = (message.audio.format || "").trim().toLowerCase();
      const mimeType =
        message.audio.mime_type ||
        (format === "pcm16" ? "audio/pcm;rate=24000" : "audio/wav");

      return {
        data: Buffer.from(message.audio.data, "base64"),
        mimeType
      };
    }
  }

  const candidates = (response as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) {
    throw new Error("Respons TTS tidak memiliki kandidat audio.");
  }

  const parts =
    (candidates[0] as {
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    })?.content?.parts ?? [];

  for (const part of parts) {
    const inline = part.inlineData;
    if (!inline?.data) {
      continue;
    }
    return {
      data: Buffer.from(inline.data, "base64"),
      mimeType: inline.mimeType || "audio/wav"
    };
  }

  throw new Error("Data audio tidak ditemukan pada respons TTS.");
}
