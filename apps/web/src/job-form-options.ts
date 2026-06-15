import { SOCIAL_PLATFORMS } from "./types";
import type { ContentType, JobVoiceGender, SocialPlatform } from "./types";

export const CONTENT_LABEL: Record<ContentType, string> = {
  affiliate: "Affiliate",
  "video-marketing": "Video Marketing",
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

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  shopee: "Shopee",
  instagram: "Instagram",
  lainnya: "Lainnya"
};

export const PLATFORM_OPTIONS: SocialPlatform[] = [...SOCIAL_PLATFORMS];

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
