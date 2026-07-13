import { SCRIPT_MODES, SOCIAL_PLATFORMS, SUBTITLE_MODES } from "./types";
import type {
  ContentLanguage,
  ContentType,
  JobVoiceGender,
  ScriptMode,
  SocialPlatform,
  SubtitleMode
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

const SCRIPT_MODE_LABELS: Record<ContentLanguage, Record<ScriptMode, string>> = {
  "id-ID": {
    auto_analysis: "Analisa Otomatis",
    manual_script: "Script Manual"
  },
  "en-US": {
    auto_analysis: "Auto Analysis",
    manual_script: "Manual Script"
  }
};

const SUBTITLE_MODE_LABELS: Record<ContentLanguage, Record<SubtitleMode, string>> = {
  "id-ID": {
    without_subtitles: "Tanpa Subtitle",
    with_subtitles: "Dengan Subtitle"
  },
  "en-US": {
    without_subtitles: "Without Subtitles",
    with_subtitles: "With Subtitles"
  }
};

const GENDER_LABELS: Record<ContentLanguage, Record<JobVoiceGender, string>> = {
  "id-ID": {
    male: "Pria",
    female: "Wanita"
  },
  "en-US": {
    male: "Male",
    female: "Female"
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
export const SCRIPT_MODE_OPTIONS: ScriptMode[] = [...SCRIPT_MODES];
export const SUBTITLE_MODE_OPTIONS: SubtitleMode[] = [...SUBTITLE_MODES];
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
  return CONTENT_LABELS[locale][value];
}

export function getPlatformLabel(locale: ContentLanguage, value: SocialPlatform): string {
  return PLATFORM_LABELS[locale][value];
}

export function getScriptModeLabel(locale: ContentLanguage, value: ScriptMode): string {
  return SCRIPT_MODE_LABELS[locale][value];
}

export function getSubtitleModeLabel(locale: ContentLanguage, value: SubtitleMode): string {
  return SUBTITLE_MODE_LABELS[locale][value];
}

export function getGenderLabel(locale: ContentLanguage, value: JobVoiceGender): string {
  return GENDER_LABELS[locale][value];
}

export function getToneLabel(locale: ContentLanguage, value: string): string {
  return TONE_LABELS[locale][value] || value;
}
