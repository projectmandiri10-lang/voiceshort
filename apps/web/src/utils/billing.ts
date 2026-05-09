export const BILLING_INTERVAL_SECONDS = 60;

export function calculateBilledMinutes(durationSec: number): number {
  const safeDuration = Number.isFinite(durationSec) ? durationSec : 0;
  return Math.max(1, Math.ceil(Math.max(0, safeDuration) / BILLING_INTERVAL_SECONDS));
}

export function calculateEstimatedChargeIdr(durationSec: number, pricePerMinuteIdr: number): number {
  return calculateBilledMinutes(durationSec) * Math.max(0, Math.trunc(pricePerMinuteIdr));
}

export function formatVideoDuration(durationSec: number): string {
  const safeDuration = Math.max(0, Math.round(durationSec));
  const minutes = Math.floor(safeDuration / BILLING_INTERVAL_SECONDS);
  const seconds = safeDuration % BILLING_INTERVAL_SECONDS;

  if (minutes <= 0) {
    return `${seconds} detik`;
  }
  if (seconds === 0) {
    return `${minutes} menit`;
  }
  return `${minutes} menit ${seconds} detik`;
}
