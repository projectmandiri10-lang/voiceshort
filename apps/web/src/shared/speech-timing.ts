export const MAX_SPEECH_END_MARGIN_SEC = 0.2;
export const TEMPO_QUALITY_WARNING_FACTOR = 1.25;
const SCRIPT_WORDS_PER_SECOND = 2;
const VERY_SHORT_VIDEO_SEC = 12;
const SHORT_VIDEO_SEC = 30;

export interface AudioFit {
  safetyMarginSec: number;
  speechTargetSec: number;
  tempoFactor: number;
  hasQualityWarning: boolean;
}

export interface ScriptWordBudget {
  targetWords: number;
  minWords: number;
  maxWords: number;
  prefersUpperHalf: boolean;
  underRunRiskWordCount: number;
}

export function calculateSpeechTarget(videoDurationSec: number): {
  safetyMarginSec: number;
  speechTargetSec: number;
} {
  const safeVideoDurationSec = Math.max(1, videoDurationSec);
  const safetyMarginSec = Math.min(MAX_SPEECH_END_MARGIN_SEC, safeVideoDurationSec * 0.02);
  return {
    safetyMarginSec: Number(safetyMarginSec.toFixed(3)),
    speechTargetSec: Number((safeVideoDurationSec - safetyMarginSec).toFixed(3))
  };
}

export function calculateAudioFit(voiceDurationSec: number, videoDurationSec: number): AudioFit {
  const timing = calculateSpeechTarget(videoDurationSec);
  const safeVoiceDurationSec = Math.max(0.01, voiceDurationSec);
  const tempoFactor = safeVoiceDurationSec / timing.speechTargetSec;
  return {
    ...timing,
    tempoFactor,
    hasQualityWarning: tempoFactor > TEMPO_QUALITY_WARNING_FACTOR
  };
}

export function calculateScriptWordBudget(videoDurationSec: number): ScriptWordBudget {
  const safeVideoDurationSec = Math.max(1, videoDurationSec);
  const baseTargetWords = Math.max(10, Math.round(safeVideoDurationSec * SCRIPT_WORDS_PER_SECOND));
  const shortVideoBonus = safeVideoDurationSec <= VERY_SHORT_VIDEO_SEC
    ? 2
    : safeVideoDurationSec <= SHORT_VIDEO_SEC
      ? 1
      : 0;
  const targetWords = baseTargetWords + shortVideoBonus;
  const minWords = Math.max(8, targetWords - (shortVideoBonus > 0 ? 1 : 2));
  const maxWords = targetWords + 2;
  const prefersUpperHalf = shortVideoBonus > 0;

  return {
    targetWords,
    minWords,
    maxWords,
    prefersUpperHalf,
    underRunRiskWordCount: prefersUpperHalf ? targetWords : minWords
  };
}

export function countSpokenWords(text: string): number {
  const normalized = String(text || "")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .trim();
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/u).filter(Boolean).length;
}
