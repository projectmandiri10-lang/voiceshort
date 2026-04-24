import type { ContentType, JobVoiceGender } from "./types";

export const CONTENT_LABEL: Record<ContentType, string> = {
  affiliate: "Affiliate",
  komedi: "Komedi",
  informasi: "Informasi",
  hiburan: "Hiburan",
  gaul: "Gaul",
  cerita: "Cerita",
  "review-produk": "Review Produk",
  edukasi: "Edukasi",
  motivasi: "Motivasi",
  "promosi-event": "Promosi Event"
};

export const GENDER_LABEL: Record<JobVoiceGender, string> = {
  male: "Pria",
  female: "Wanita"
};

export const TONE_OPTIONS = [
  "natural",
  "enerjik",
  "friendly",
  "informatif",
  "fun",
  "hangat",
  "tegas"
] as const;
