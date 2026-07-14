import { SOCIAL_PLATFORMS } from "./types";
import type {
  ContentLanguage,
  ContentType,
  SocialPlatform
} from "./types";

const CONTENT_LABELS: Record<ContentLanguage, Record<ContentType, string>> = {
  "id-ID": {
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
  },
  "en-US": {
    affiliate: "Affiliate",
    "video-marketing": "Video Marketing",
    komedi: "Comedy",
    informasi: "Informational",
    hiburan: "Entertainment",
    gaul: "Casual",
    cerita: "Storytelling",
    "review-produk": "Product Review",
    edukasi: "Educational",
    motivasi: "Motivational",
    "promosi-event": "Event Promotion"
  }
};

const PLATFORM_LABELS: Record<ContentLanguage, Record<SocialPlatform, string>> = {
  "id-ID": {
    facebook: "Facebook",
    tiktok: "TikTok",
    youtube: "YouTube",
    shopee: "Shopee",
    instagram: "Instagram",
    lainnya: "Lainnya"
  },
  "en-US": {
    facebook: "Facebook",
    tiktok: "TikTok",
    youtube: "YouTube",
    shopee: "Shopee",
    instagram: "Instagram",
    lainnya: "Other"
  }
};

const TONE_LABELS: Record<ContentLanguage, Record<string, string>> = {
  "id-ID": {
    natural: "Natural",
    enerjik: "Enerjik",
    friendly: "Friendly",
    informatif: "Informatif",
    fun: "Fun",
    hangat: "Hangat",
    tegas: "Tegas"
  },
  "en-US": {
    natural: "Natural",
    enerjik: "Energetic",
    friendly: "Friendly",
    informatif: "Informative",
    fun: "Fun",
    hangat: "Warm",
    tegas: "Assertive"
  }
};

export const PLATFORM_OPTIONS: SocialPlatform[] = [...SOCIAL_PLATFORMS];
export const TONE_OPTIONS = [
  "natural",
  "enerjik",
  "friendly",
  "informatif",
  "fun",
  "hangat",
  "tegas"
] as const;

export function getContentLabel(locale: ContentLanguage, value: ContentType): string {
  return CONTENT_LABELS[locale][value] || value;
}

export function getPlatformLabel(locale: ContentLanguage, value: SocialPlatform): string {
  return PLATFORM_LABELS[locale][value] || value;
}

export function getToneLabel(locale: ContentLanguage, value: string): string {
  return TONE_LABELS[locale][value] || value;
}
