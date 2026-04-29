import { CONTENT_CONFIG, CONTENT_LABELS } from "../content-config.js";
import type { AppSettings, ContentType, JobVoiceGender, VisualBrief } from "../types.js";

export interface PromptInput {
  settings: AppSettings;
  title: string;
  description: string;
  contentType: ContentType;
  voiceGender: JobVoiceGender;
  tone: string;
  videoDurationSec: number;
  ctaText?: string;
  referenceLink?: string;
}

export interface ScriptPromptInput extends PromptInput {
  visualBrief?: VisualBrief;
}

export interface CaptionPromptInput extends PromptInput {
  scriptText: string;
  visualBrief?: VisualBrief;
  hashtagHints?: string[];
}

export function estimateWordRange(durationSec: number): {
  min: number;
  target: number;
  max: number;
} {
  const safeDuration = Math.max(5, durationSec);
  const target = Math.round(safeDuration * 2.2);
  const min = Math.max(20, Math.round(target * 0.85));
  const max = Math.max(min + 8, Math.round(target * 1.15));
  return { min, target, max };
}

function voiceGenderLabel(gender: JobVoiceGender): string {
  return gender === "male" ? "pria" : "wanita";
}

function buildClosingInstruction(input: PromptInput): string {
  if (input.ctaText?.trim()) {
    return `Gunakan CTA berikut secara natural di bagian akhir: "${input.ctaText.trim()}".`;
  }

  const ctaIntensity = CONTENT_CONFIG[input.contentType].ctaIntensity;
  if (ctaIntensity === "high") {
    return "Tutup dengan ajakan ringan yang relevan, tanpa terasa memaksa.";
  }
  if (ctaIntensity === "medium") {
    return "Penutup boleh berupa ajakan lembut bila cocok dengan alur.";
  }
  return "Tutup secara natural tanpa hard-sell.";
}

function buildReferenceLine(referenceLink?: string): string {
  return referenceLink?.trim()
    ? `Referensi tambahan: ${referenceLink.trim()}`
    : "Referensi tambahan: tidak ada";
}

function buildContextLines(input: PromptInput): string[] {
  return [
    `Kategori konten: ${CONTENT_LABELS[input.contentType]}`,
    `Judul/topik: ${input.title}`,
    `Brief/deskripsi: ${input.description}`,
    buildReferenceLine(input.referenceLink),
    `Tone yang diminta client: ${input.tone}.`,
    `Voice talent yang diminta: ${voiceGenderLabel(input.voiceGender)}.`,
    `Batas safety mode: ${input.settings.safetyMode}`,
    `Durasi video: ${input.videoDurationSec.toFixed(2)} detik.`
  ];
}

function buildHashtagHintLines(hashtagHints?: string[]): string[] {
  if (!hashtagHints?.length) {
    return ["Arahan hashtag user: tidak ada"];
  }

  return [
    `Arahan hashtag user: ${hashtagHints.join(", ")}`,
    "Gunakan arahan hashtag ini hanya sebagai referensi tema/tag bila relevan dengan caption dan visual."
  ];
}

function formatVisualBrief(visualBrief: VisualBrief): string {
  return JSON.stringify(visualBrief, null, 2);
}

function buildVisualSourceLines(visualBrief?: VisualBrief): string[] {
  if (!visualBrief) {
    return [
      "Sumber visual:",
      "- Video akan dianalisis langsung bersama prompt ini.",
      "- Ikuti urutan visual dari awal sampai akhir tanpa loncat adegan.",
      "- Sebut hanya detail yang benar-benar terlihat atau terdengar jelas dari video.",
      "- Jika ada detail ambigu, gunakan deskripsi generik dan aman; jangan menebak."
    ];
  }

  return [
    "Sumber visual resmi (gunakan sebagai dasar voice over/caption dan jangan menambah detail di luar ini):",
    formatVisualBrief(visualBrief)
  ];
}

export function buildVisualBriefPrompt(input: PromptInput): string {
  const schemaExample = {
    summary: "ringkasan visual utama video",
    hook: {
      startSec: 0,
      endSec: 0,
      reason: "momen visual paling kuat untuk pembuka"
    },
    timeline: [
      {
        startSec: 0,
        endSec: 0,
        primaryVisual: "apa yang benar-benar terlihat",
        action: "aksi/perubahan yang terjadi",
        onScreenText: ["teks yang benar-benar muncul"],
        narrationFocus: "inti narasi untuk beat ini",
        avoidClaims: ["hal yang tidak boleh diasumsikan"]
      }
    ],
    mustMention: ["elemen visual penting yang jelas terlihat"],
    mustAvoid: ["detail yang tidak terlihat atau tidak pasti"],
    uncertainties: ["detail yang ambigu dan harus digeneralisasi"]
  };

  return [
    "Anda adalah analis visual video short berbahasa Indonesia.",
    "Tugas Anda adalah membuat visual brief terstruktur yang akan dipakai untuk menulis voice over dan caption.",
    "Metadata job di bawah hanya konteks tujuan konten. Jika metadata bertentangan dengan video, prioritaskan bukti visual/audio dari video.",
    "Aturan penting:",
    "- Analisis hanya berdasarkan bukti visual/audio yang benar-benar ada di video.",
    "- Jangan menebak merek, lokasi, manfaat produk, hasil penggunaan, identitas orang, atau teks layar bila tidak terlihat jelas.",
    "- Pecah video menjadi 3-8 beat berurutan yang menutup seluruh durasi video.",
    "- Setiap beat wajib menjelaskan visual utama, aksi/perubahan, teks layar yang jelas terlihat, fokus narasi, dan klaim yang harus dihindari.",
    "- Tandai momen hook visual terbaik untuk pembuka voice over.",
    "- Jika ada detail ambigu, masukkan ke uncertainties; jangan jadikan fakta.",
    "- Kembalikan JSON valid saja tanpa markdown, code fence, atau teks tambahan.",
    "",
    "Gunakan struktur JSON berikut:",
    JSON.stringify(schemaExample, null, 2),
    "",
    ...buildContextLines(input)
  ].join("\n");
}

export function buildScriptPrompt(input: ScriptPromptInput): string {
  const words = estimateWordRange(input.videoDurationSec);
  const content = CONTENT_CONFIG[input.contentType];

  return [
    "Anda adalah penulis naskah voice over video short berbahasa Indonesia.",
    input.contentType === "affiliate"
      ? "Fokus Anda adalah naskah affiliate yang persuasif, aman, natural, dan akurat terhadap visual."
      : "Fokus Anda adalah naskah general content yang natural, aman, enak didengar, dan akurat terhadap visual.",
    "Aturan penting:",
    "- Gunakan Bahasa Indonesia yang natural dan mudah diucapkan.",
    "- Kalimat pembuka wajib menjadi hook kuat agar penonton berhenti scroll.",
    "- Naskah harus cocok dibacakan sebagai voice over untuk video short.",
    "- Hindari klaim medis, absolut, menyesatkan, atau berlebihan.",
    `- Panjang naskah sekitar ${words.target} kata (rentang ${words.min}-${words.max} kata) agar pas untuk durasi video ${input.videoDurationSec.toFixed(2)} detik.`,
    `- Gaya hook: ${content.hookStyle}.`,
    `- Arah isi: ${content.briefFocus}.`,
    `- Karakter delivery: ${content.deliveryStyle}.`,
    `- Tone yang diminta client: ${input.tone}.`,
    `- Voice talent yang diminta: ${voiceGenderLabel(input.voiceGender)}.`,
    `- ${buildClosingInstruction(input)}`,
    "- Narasi wajib mengikuti urutan visual dari awal sampai akhir tanpa loncat adegan.",
    "- Hook pembuka harus merujuk ke momen visual paling kuat yang benar-benar tampak.",
    "- Sebut teks layar hanya jika benar-benar terlihat jelas. Jika memakai visual brief, ambil hanya dari field onScreenText.",
    "- Jangan menambahkan klaim produk, lokasi, manfaat, hasil penggunaan, identitas orang, atau situasi yang tidak didukung visual.",
    "- Jika ada detail ambigu atau masuk uncertainties, gunakan frasa generik dan aman; jangan membuat detail spesifik.",
    "- Jika memakai visual brief, patuhi timeline, mustMention, mustAvoid, dan avoidClaims di tiap beat.",
    "",
    ...buildContextLines(input),
    "",
    ...buildVisualSourceLines(input.visualBrief),
    "",
    "Bangun satu naskah final saja tanpa markdown, tanpa penomoran, dan tanpa penjelasan tambahan."
  ].join("\n");
}

export function buildCaptionPrompt(input: CaptionPromptInput): string {
  const content = CONTENT_CONFIG[input.contentType];

  return [
    "Anda adalah penulis caption media sosial untuk video short berbahasa Indonesia.",
    input.contentType === "affiliate"
      ? "Fokus Anda adalah membuat caption affiliate yang menarik, aman, natural, dan selaras dengan visual."
      : "Fokus Anda adalah membuat caption general content yang engaging, aman, natural, dan selaras dengan visual.",
    "Aturan penting:",
    "- Caption harus terasa seperti copy postingan sosial, bukan naskah voice over.",
    "- Gunakan Bahasa Indonesia yang natural, ringkas, dan relevan dengan video.",
    "- Pertahankan tone yang diminta client dan sesuaikan dengan kategori konten.",
    "- Caption harus mengikuti hook dan visual utama yang sama dengan script/visual brief.",
    "- Jangan membuat angle caption yang bertentangan dengan apa yang terlihat di video.",
    "- Jangan menambah klaim, manfaat, situasi, atau teks layar yang tidak didukung visual.",
    "- Hindari markdown, penjelasan tambahan, code fence, dan label apa pun.",
    "- Field `caption` tidak boleh berisi hashtag.",
    "- Field `hashtags` berisi hashtag relevan dan aman untuk video short.",
    "- Kembalikan JSON valid saja dengan format: {\"caption\":\"...\",\"hashtags\":[\"#tag1\",\"#tag2\"]}.",
    "",
    `Gaya hook video: ${content.hookStyle}.`,
    `Arah isi: ${content.briefFocus}.`,
    `Karakter delivery: ${content.deliveryStyle}.`,
    ...buildContextLines(input),
    ...buildHashtagHintLines(input.hashtagHints),
    `Referensi naskah voice over: ${input.scriptText}`,
    "",
    ...buildVisualSourceLines(input.visualBrief),
    "",
    "Pastikan caption singkat, enak dibaca, dan cocok dipakai langsung untuk posting."
  ].join("\n");
}
