interface CueDraft {
  text: string;
  lines: string[];
  words: number;
}

export interface TimedSubtitleCue extends CueDraft {
  startSec: number;
  endSec: number;
}

interface SubtitleProfile {
  targetLine: number;
  maxLine: number;
  maxBlock: number;
  minCueDurationSec: number;
  maxCueDurationSec: number;
}

const DEFAULT_SUBTITLE_PROFILE: SubtitleProfile = {
  targetLine: 32,
  maxLine: 38,
  maxBlock: 76,
  minCueDurationSec: 0.9,
  maxCueDurationSec: 3.8,
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function countWords(input: string): number {
  const normalized = normalizeWhitespace(input);
  return normalized ? normalized.split(" ").length : 0;
}

function chunkScript(script: string, profile: SubtitleProfile): string[] {
  const words = normalizeWhitespace(script).split(" ").filter(Boolean);
  if (!words.length) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= profile.maxBlock) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
    }
    current = word;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function findNearestSplit(text: string, target: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < text.length - 1; index += 1) {
    if (text[index] !== " ") {
      continue;
    }
    const distance = Math.abs(index - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function splitInHalf(text: string): [string, string] {
  const normalized = normalizeWhitespace(text);
  const splitIndex = findNearestSplit(normalized, Math.floor(normalized.length / 2));
  if (splitIndex < 0) {
    const middle = Math.floor(normalized.length / 2);
    return [normalized.slice(0, middle).trim(), normalized.slice(middle).trim()];
  }
  return [normalized.slice(0, splitIndex).trim(), normalized.slice(splitIndex + 1).trim()];
}

function enforceCueCount(chunks: string[], totalDurationSec: number, profile: SubtitleProfile): string[] {
  const minCount = Math.max(1, Math.ceil(totalDurationSec / profile.maxCueDurationSec));
  const maxCount = Math.max(1, Math.floor(totalDurationSec / profile.minCueDurationSec));
  const next = [...chunks];

  while (next.length < minCount) {
    const selectedIndex = next
      .map((text, index) => ({ index, length: text.length }))
      .sort((left, right) => right.length - left.length)[0]?.index;
    if (selectedIndex === undefined) {
      break;
    }
    const selected = next[selectedIndex];
    if (!selected) {
      break;
    }
    const [left, right] = splitInHalf(selected);
    if (!left || !right) {
      break;
    }
    next.splice(selectedIndex, 1, left, right);
  }

  while (next.length > maxCount && next.length > 1) {
    const selectedIndex = next
      .map((text, index) => ({ index, length: text.length }))
      .sort((left, right) => left.length - right.length)[0]?.index;
    if (selectedIndex === undefined) {
      break;
    }
    const neighborIndex = selectedIndex === 0 ? 1 : selectedIndex - 1;
    const merged = `${next[neighborIndex] ?? ""} ${next[selectedIndex] ?? ""}`.trim();
    next[neighborIndex] = merged;
    next.splice(selectedIndex, 1);
  }

  return next;
}

function wrapCueLines(text: string, profile: SubtitleProfile): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= profile.maxLine) {
    return [normalized];
  }
  const splitIndex = findNearestSplit(normalized, profile.targetLine);
  if (splitIndex < 0) {
    return [
      normalized.slice(0, profile.maxLine).trim(),
      normalized.slice(profile.maxLine).trim(),
    ].filter(Boolean);
  }

  const first = normalized.slice(0, splitIndex).trim();
  const second = normalized.slice(splitIndex + 1).trim();
  if (first.length <= profile.maxLine && second.length <= profile.maxLine) {
    return [first, second];
  }

  return [
    normalized.slice(0, profile.maxLine).trim(),
    normalized.slice(profile.maxLine).trim(),
  ].filter(Boolean);
}

function createDrafts(script: string, totalDurationSec: number, profile: SubtitleProfile): CueDraft[] {
  const chunks = enforceCueCount(chunkScript(script, profile), totalDurationSec, profile);
  return chunks.map((chunk) => ({
    text: chunk,
    lines: wrapCueLines(chunk, profile).slice(0, 2),
    words: Math.max(1, countWords(chunk)),
  }));
}

function distributeDurations(drafts: CueDraft[], totalDurationSec: number, profile: SubtitleProfile): number[] {
  const totalWords = drafts.reduce((sum, draft) => sum + draft.words, 0);
  let durations = drafts.map((draft) => (totalDurationSec * draft.words) / totalWords);
  durations = durations.map((value) =>
    Math.max(profile.minCueDurationSec, Math.min(profile.maxCueDurationSec, value))
  );

  let diff = totalDurationSec - durations.reduce((sum, value) => sum + value, 0);
  let guard = 0;
  while (Math.abs(diff) > 0.001 && guard < 5000) {
    guard += 1;
    if (diff > 0) {
      const expandable = durations
        .map((value, index) => ({ index, room: profile.maxCueDurationSec - value }))
        .filter((item) => item.room > 0);
      if (!expandable.length) {
        break;
      }
      const roomSum = expandable.reduce((sum, item) => sum + item.room, 0);
      for (const item of expandable) {
        const add = Math.min(item.room, (diff * item.room) / roomSum);
        durations[item.index] = (durations[item.index] ?? profile.minCueDurationSec) + add;
        diff -= add;
      }
    } else {
      const shrinkable = durations
        .map((value, index) => ({ index, room: value - profile.minCueDurationSec }))
        .filter((item) => item.room > 0);
      if (!shrinkable.length) {
        break;
      }
      const roomSum = shrinkable.reduce((sum, item) => sum + item.room, 0);
      for (const item of shrinkable) {
        const remove = Math.min(item.room, (Math.abs(diff) * item.room) / roomSum);
        durations[item.index] = (durations[item.index] ?? profile.minCueDurationSec) - remove;
        diff += remove;
      }
    }
  }

  if (Math.abs(diff) > 0.001) {
    const lastIndex = durations.length - 1;
    durations[lastIndex] = Math.max(
      profile.minCueDurationSec,
      Math.min(profile.maxCueDurationSec, (durations[lastIndex] ?? profile.minCueDurationSec) + diff)
    );
  }

  return durations;
}

export function buildTimedSubtitleCues(script: string, totalDurationSec: number): TimedSubtitleCue[] {
  const cleaned = normalizeWhitespace(script);
  if (!cleaned || !Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
    return [];
  }

  const drafts = createDrafts(cleaned, totalDurationSec, DEFAULT_SUBTITLE_PROFILE);
  if (!drafts.length) {
    return [];
  }

  const durations = distributeDurations(drafts, totalDurationSec, DEFAULT_SUBTITLE_PROFILE);
  let cursor = 0;
  return drafts.map((draft, index) => {
    const duration = durations[index] ?? DEFAULT_SUBTITLE_PROFILE.minCueDurationSec;
    const startSec = cursor;
    cursor += duration;
    const endSec = index === drafts.length - 1 ? totalDurationSec : Math.min(totalDurationSec, cursor);
    return {
      ...draft,
      startSec,
      endSec,
    };
  });
}
