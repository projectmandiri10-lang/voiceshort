import type { AiStudioPackage, VisualBrief, VisualBriefTimelineItem } from "../types";

function stripCodeFence(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const lines = trimmed.split("\n");
  return lines.slice(1, lines[lines.length - 1]?.startsWith("```") ? -1 : undefined).join("\n").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function seconds(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : fallback;
}

function timelineItem(raw: unknown): VisualBriefTimelineItem | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  const startSec = seconds(item.startSec);
  const primaryVisual = text(item.primaryVisual);
  const action = text(item.action);
  const narrationFocus = text(item.narrationFocus);
  if (!primaryVisual || !action || !narrationFocus) return undefined;
  return {
    startSec,
    endSec: Math.max(startSec, seconds(item.endSec, startSec)),
    primaryVisual,
    action,
    onScreenText: textList(item.onScreenText),
    narrationFocus,
    avoidClaims: textList(item.avoidClaims)
  };
}

export function extractTextFromGeminiResponse(response: Record<string, unknown>): string {
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const content = (candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined)?.content;
  return (Array.isArray(content?.parts) ? content.parts : [])
    .map((part) => typeof part.text === "string" ? part.text.trim() : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractVisualBrief(response: Record<string, unknown>): VisualBrief {
  const object = parseJsonObject(stripCodeFence(extractTextFromGeminiResponse(response)));
  if (!object) throw new Error("Visual brief tidak berupa JSON valid.");
  const timeline = (Array.isArray(object.timeline) ? object.timeline : [])
    .map(timelineItem)
    .filter((item): item is VisualBriefTimelineItem => Boolean(item))
    .sort((a, b) => a.startSec - b.startSec);
  const summary = text(object.summary);
  if (!summary || !timeline.length) throw new Error("Visual brief tidak memenuhi struktur minimal.");
  const hook = object.hook && typeof object.hook === "object" && !Array.isArray(object.hook)
    ? object.hook as Record<string, unknown>
    : {};
  const first = timeline[0]!;
  return {
    summary,
    hook: {
      startSec: seconds(hook.startSec, first.startSec),
      endSec: Math.max(seconds(hook.startSec, first.startSec), seconds(hook.endSec, first.endSec)),
      reason: text(hook.reason) || first.narrationFocus
    },
    timeline,
    mustMention: textList(object.mustMention),
    mustAvoid: textList(object.mustAvoid),
    uncertainties: textList(object.uncertainties)
  };
}

function hashtags(value: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const cleaned = text(raw).replace(/[^\p{L}\p{N}_#]/gu, "");
    const tag = cleaned ? (cleaned.startsWith("#") ? cleaned : `#${cleaned}`).toLowerCase() : "";
    if (tag.length > 1 && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
    if (result.length >= 8) break;
  }
  return result;
}

export function extractAiStudioPackage(response: Record<string, unknown>): AiStudioPackage {
  const object = parseJsonObject(stripCodeFence(extractTextFromGeminiResponse(response)));
  if (!object) throw new Error("Paket AI Studio tidak berupa JSON valid.");
  const result: AiStudioPackage = {
    sceneText: text(object.sceneText),
    sampleContextText: text(object.sampleContextText),
    scriptText: text(object.scriptText),
    captionText: text(object.captionText).replace(/#[\p{L}\p{N}_]+/gu, "").trim(),
    hashtags: hashtags(object.hashtags)
  };
  if (!result.sceneText || !result.sampleContextText || !result.scriptText || !result.captionText) {
    throw new Error("Paket AI Studio tidak memenuhi struktur minimal.");
  }
  return result;
}
