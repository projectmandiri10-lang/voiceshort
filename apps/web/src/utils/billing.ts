export const BILLING_INTERVAL_SECONDS = 60;

export function calculateEstimatedChargeIdr(pricePerGenerateIdr: number): number {
  return Math.max(0, Math.trunc(pricePerGenerateIdr));
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
