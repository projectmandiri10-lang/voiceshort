import type { ContentType } from "../types";

export interface ContentDefinition {
  label: string;
  briefFocus: string;
  hookStyle: string;
  deliveryStyle: string;
  ctaIntensity: "low" | "medium" | "high";
}

export const CONTENT_CONFIG: Record<ContentType, ContentDefinition> = {
  affiliate: {
    label: "Affiliate",
    briefFocus: "tekankan manfaat, relevansi produk, dan alasan orang tertarik mencoba",
    hookStyle: "scroll-stopping, rasa penasaran, cepat masuk inti",
    deliveryStyle: "persuasif, natural, tidak hard sell berlebihan",
    ctaIntensity: "high"
  },
  "video-marketing": {
    label: "Video Marketing",
    briefFocus: "tekankan nilai jual, diferensiasi, dan alasan audiens perlu peduli sejak awal",
    hookStyle: "tajam, problem-solution, dan cepat masuk ke value utama",
    deliveryStyle: "meyakinkan, rapi, tetap natural, dan cocok untuk promosi brand atau jasa",
    ctaIntensity: "high"
  },
  komedi: {
    label: "Komedi",
    briefFocus: "bangun situasi lucu yang cepat dipahami dan aman",
    hookStyle: "aneh, relatable, atau absurd ringan",
    deliveryStyle: "ringan, punchy, enak didengar",
    ctaIntensity: "low"
  },
  informasi: {
    label: "Informasi",
    briefFocus: "jelas, ringkas, dan mudah diikuti",
    hookStyle: "fakta menarik atau pertanyaan pemantik",
    deliveryStyle: "informatif dan bersih",
    ctaIntensity: "low"
  },
  hiburan: {
    label: "Hiburan",
    briefFocus: "buat penonton nyaman dan terhibur dari awal sampai akhir",
    hookStyle: "fun, santai, dan mengundang lanjut nonton",
    deliveryStyle: "ringan, ekspresif, hangat",
    ctaIntensity: "low"
  },
  gaul: {
    label: "Gaul",
    briefFocus: "gunakan bahasa sehari-hari yang dekat dengan audience muda",
    hookStyle: "relatable dan cepat nyambung",
    deliveryStyle: "casual, natural, tidak berlebihan",
    ctaIntensity: "medium"
  },
  cerita: {
    label: "Cerita",
    briefFocus: "bangun alur singkat dengan emosi yang terasa",
    hookStyle: "bikin penasaran sejak kalimat pertama",
    deliveryStyle: "storytelling dan mengalir",
    ctaIntensity: "low"
  },
  "review-produk": {
    label: "Review Produk",
    briefFocus: "jelaskan fungsi, kesan utama, dan nilai pakai secara jujur",
    hookStyle: "pengalaman atau kesan awal yang kuat",
    deliveryStyle: "objektif tapi tetap menarik",
    ctaIntensity: "medium"
  },
  edukasi: {
    label: "Edukasi",
    briefFocus: "mudahkan pemahaman tanpa terasa menggurui",
    hookStyle: "rasa ingin tahu tinggi",
    deliveryStyle: "jelas, runtut, mudah dipahami",
    ctaIntensity: "low"
  },
  motivasi: {
    label: "Motivasi",
    briefFocus: "beri dorongan positif yang singkat dan terasa",
    hookStyle: "menyentuh masalah audiens dari awal",
    deliveryStyle: "hangat, kuat, tidak menggurui",
    ctaIntensity: "low"
  },
  "promosi-event": {
    label: "Promosi Event",
    briefFocus: "jelaskan event, manfaat ikut, dan alasan harus segera daftar",
    hookStyle: "urgency ringan dan rasa penasaran",
    deliveryStyle: "jelas, energik, langsung",
    ctaIntensity: "high"
  }
};

export const CONTENT_LABELS: Record<ContentType, string> = Object.fromEntries(
  Object.entries(CONTENT_CONFIG).map(([key, value]) => [key, value.label])
) as Record<ContentType, string>;
