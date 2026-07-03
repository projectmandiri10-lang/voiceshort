import { CONTENT_LANGUAGES, type ContentLanguage } from "./types";

export type UserLocale = ContentLanguage;

const DEFAULT_LOCALE: UserLocale = "en-US";

export function isContentLanguage(value: unknown): value is ContentLanguage {
  return CONTENT_LANGUAGES.includes(value as ContentLanguage);
}

export function resolveLocaleFromLanguage(language?: string | null): UserLocale {
  const normalized = String(language || "").trim().toLowerCase();
  return normalized.startsWith("id") ? "id-ID" : DEFAULT_LOCALE;
}

export function resolveBrowserLocale(): UserLocale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }
  return resolveLocaleFromLanguage(navigator.language);
}

export function formatIdrCurrency(value: number | null | undefined, locale: UserLocale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function formatDateTime(value: string | Date | null | undefined, locale: UserLocale): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatCompactIdr(value: number, locale: UserLocale): string {
  return formatIdrCurrency(value, locale);
}

export function formatDurationSeconds(value: number, locale: UserLocale): string {
  return locale === "id-ID" ? `${value.toFixed(2)} detik` : `${value.toFixed(2)} sec`;
}
