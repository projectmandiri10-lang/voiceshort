const DURATION_TOLERANCE_SEC = 0.2;
const DURATION_TOLERANCE_RATIO = 0.011;
const MAX_NATURAL_TEMPO_DELTA_RATIO = 0.12;

export function isVoiceDurationAligned(
  actualDurationSec: number,
  targetDurationSec: number
): boolean {
  const safeTarget = Math.max(1, targetDurationSec);
  const toleranceSec = Math.max(DURATION_TOLERANCE_SEC, safeTarget * DURATION_TOLERANCE_RATIO);
  return Math.abs(actualDurationSec - safeTarget) <= toleranceSec;
}

export function needsScriptRetiming(
  actualDurationSec: number,
  targetDurationSec: number
): boolean {
  if (isVoiceDurationAligned(actualDurationSec, targetDurationSec)) {
    return false;
  }
  const safeTarget = Math.max(1, targetDurationSec);
  const tempoFactor = Math.max(0.01, actualDurationSec) / safeTarget;
  return Math.abs(tempoFactor - 1) > MAX_NATURAL_TEMPO_DELTA_RATIO;
}
