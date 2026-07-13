export const MAX_SPEECH_END_MARGIN_SEC = 0.2;
export const TEMPO_QUALITY_WARNING_FACTOR = 1.25;

export interface AudioFit {
  safetyMarginSec: number;
  speechTargetSec: number;
  tempoFactor: number;
  hasQualityWarning: boolean;
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
