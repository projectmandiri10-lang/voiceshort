export const BILLING_INTERVAL_SECONDS = 60;
export const GENERATE_PRICE_IDR_DEFAULT = 2000;

export function normalizeGeneratePriceIdr(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : GENERATE_PRICE_IDR_DEFAULT;
}

export function calculateBilledMinutes(durationSec: number): number {
  const safeDuration = Number.isFinite(durationSec) ? durationSec : 0;
  return Math.max(1, Math.ceil(Math.max(0, safeDuration) / BILLING_INTERVAL_SECONDS));
}

export function calculateGenerateChargeIdr(durationSec: number, pricePerMinuteIdr: number): number {
  return calculateBilledMinutes(durationSec) * normalizeGeneratePriceIdr(pricePerMinuteIdr);
}
