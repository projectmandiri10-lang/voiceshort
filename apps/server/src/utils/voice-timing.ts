const MIN_SPEECH_RATE = 0.7;
const MAX_SPEECH_RATE = 1.3;
// Untuk video pendek (<= 60 detik), toleransi perlu ketat supaya tidak ada sisa "sunyi" (pad) atau potongan voice (trim).
const DURATION_TOLERANCE_SEC = 0.2;
const DURATION_TOLERANCE_RATIO = 0.011;
// Izinkan koreksi tempo lokal yang sedikit lebih besar agar durasi lebih presisi tanpa perlu rewrite script terlalu sering.
const MAX_LOCAL_RATE_DELTA_RATIO = 0.12;

export function isVoiceDurationAligned(
  actualDurationSec: number,
  targetDurationSec: number
): boolean {
  const safeTarget = Math.max(1, targetDurationSec);
  const toleranceSec = Math.max(DURATION_TOLERANCE_SEC, safeTarget * DURATION_TOLERANCE_RATIO);
  return Math.abs(actualDurationSec - safeTarget) <= toleranceSec;
}

export function calculateAdjustedSpeechRate(input: {
  currentDurationSec: number;
  targetDurationSec: number;
  currentSpeechRate: number;
}): number | undefined {
  const safeTarget = Math.max(1, input.targetDurationSec);
  const safeCurrentRate = clampSpeechRate(input.currentSpeechRate);
  const nextRate = clampSpeechRate(
    safeCurrentRate * (Math.max(0.01, input.currentDurationSec) / safeTarget)
  );
  const relativeDelta = Math.abs(nextRate - safeCurrentRate) / safeCurrentRate;
  if (relativeDelta > MAX_LOCAL_RATE_DELTA_RATIO) {
    return undefined;
  }
  if (Math.abs(nextRate - safeCurrentRate) < 0.01) {
    return undefined;
  }
  return Number(nextRate.toFixed(3));
}

export function clampSpeechRate(rate: number): number {
  return Math.max(MIN_SPEECH_RATE, Math.min(MAX_SPEECH_RATE, rate));
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
