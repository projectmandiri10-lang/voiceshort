import { CONTENT_CONFIG } from "./content-config";
import { getContentLabel, getPlatformLabel } from "../job-form-options";
import type {
  AppSettings,
  ContentLanguage,
  ContentType,
  JobVoiceGender,
  ScriptMode,
  SocialPlatform,
  VisualBrief
} from "../types";

export interface PromptInput {
  settings: AppSettings;
  title: string;
  description: string;
  contentType: ContentType;
  socialPlatform: SocialPlatform;
  contentLanguage: ContentLanguage;
  voiceGender: JobVoiceGender;
  tone: string;
  videoDurationSec: number;
  frameCount?: number;
  ctaText?: string;
  referenceLink?: string;
}

export interface ScriptPromptInput extends PromptInput {
  visualBrief?: VisualBrief;
}

export interface CaptionPromptInput extends PromptInput {
  scriptText: string;
  scriptMode?: ScriptMode;
  visualBrief?: VisualBrief;
}

const TARGET_NARRATION_WORDS_PER_SECOND = 2.2;
const MIN_NARRATION_WORDS_PER_SECOND = 2.0;
const MAX_NARRATION_WORDS_PER_SECOND = 2.35;

const EN_CONTENT_COPY: Record<
  ContentType,
  {
    briefFocus: string;
    hookStyle: string;
    deliveryStyle: string;
  }
> = {
  affiliate: {
    briefFocus: "emphasize product relevance, visible benefits, and why people would want to try it",
    hookStyle: "scroll-stopping, curiosity-led, and fast to the point",
    deliveryStyle: "persuasive, natural, and not overly hard sell"
  },
  "video-marketing": {
    briefFocus: "highlight value, differentiation, and why the audience should care early",
    hookStyle: "sharp, problem-solution oriented, and fast to the core value",
    deliveryStyle: "convincing, polished, natural, and fit for brand or service promotion"
  },
  komedi: {
    briefFocus: "build a funny, quickly understandable, and safe situation",
    hookStyle: "odd, relatable, or lightly absurd",
    deliveryStyle: "light, punchy, and easy to hear"
  },
  informasi: {
    briefFocus: "keep it clear, concise, and easy to follow",
    hookStyle: "an interesting fact or a curiosity hook",
    deliveryStyle: "informative and clean"
  },
  hiburan: {
    briefFocus: "keep viewers comfortable and entertained from start to finish",
    hookStyle: "fun, relaxed, and inviting viewers to keep watching",
    deliveryStyle: "light, expressive, and warm"
  },
  gaul: {
    briefFocus: "use everyday language that feels close to younger audiences",
    hookStyle: "relatable and instantly engaging",
    deliveryStyle: "casual, natural, and not exaggerated"
  },
  cerita: {
    briefFocus: "build a short narrative with noticeable emotion",
    hookStyle: "spark curiosity from the very first line",
    deliveryStyle: "story-driven and flowing"
  },
  "review-produk": {
    briefFocus: "explain function, first impression, and usefulness honestly",
    hookStyle: "a strong first impression or direct user experience",
    deliveryStyle: "objective but still engaging"
  },
  edukasi: {
    briefFocus: "make the topic easy to understand without sounding preachy",
    hookStyle: "driven by strong curiosity",
    deliveryStyle: "clear, structured, and easy to understand"
  },
  motivasi: {
    briefFocus: "deliver a short, positive push that feels sincere",
    hookStyle: "touch the audience's tension from the opening",
    deliveryStyle: "warm, strong, and not preachy"
  },
  "promosi-event": {
    briefFocus: "explain the event, why it matters, and why people should register soon",
    hookStyle: "light urgency with curiosity",
    deliveryStyle: "clear, energetic, and direct"
  }
};

function estimateWordRange(durationSec: number): {
  min: number;
  target: number;
  max: number;
} {
  const safeDuration = Math.max(5, durationSec);
  const target = Math.round(safeDuration * TARGET_NARRATION_WORDS_PER_SECOND);
  const min = Math.max(10, Math.round(safeDuration * MIN_NARRATION_WORDS_PER_SECOND));
  const max = Math.max(min + 5, Math.round(safeDuration * MAX_NARRATION_WORDS_PER_SECOND));
  return { min, target, max };
}

function estimateVisualBeatRange(durationSec: number): {
  min: number;
  max: number;
} {
  const safeDuration = Math.max(10, durationSec);
  if (safeDuration <= 60) {
    return { min: 3, max: 8 };
  }

  const progress = Math.min(1, Math.max(0, (safeDuration - 60) / 840));
  return {
    min: Math.max(3, Math.min(8, Math.round(3 + progress * 5))),
    max: Math.max(8, Math.min(15, Math.round(8 + progress * 7)))
  };
}

function voiceGenderLabel(language: ContentLanguage, gender: JobVoiceGender): string {
  if (language === "en-US") {
    return gender === "male" ? "male" : "female";
  }
  return gender === "male" ? "pria" : "wanita";
}

function socialPlatformGuidance(language: ContentLanguage, platform: SocialPlatform): string {
  if (language === "en-US") {
    switch (platform) {
      case "facebook":
        return "Keep the style clear, readable, and friendly for a broad audience.";
      case "tiktok":
        return "Use a fast hook, punchy rhythm, and short lines that suit quick scrolling.";
      case "youtube":
        return "Make it more structured, informative, and easy to follow for slightly longer watch time.";
      case "shopee":
        return "Focus on visible product value, click motivation, and natural conversion intent.";
      case "instagram":
        return "Keep the copy concise, visual, and pleasant for feed, reels, or stories.";
      case "lainnya":
        return "Use a flexible general style that still feels natural for an unspecified platform.";
    }
  }

  switch (platform) {
    case "facebook":
      return "Buat gaya yang jelas, mudah dibaca, dan tetap ramah untuk audiens yang lebih luas.";
    case "tiktok":
      return "Buat hook cepat, ritme punchy, dan kalimat yang singkat supaya cocok untuk scroll cepat.";
    case "youtube":
      return "Buat alur lebih runtut, informatif, dan enak diikuti untuk durasi tonton yang lebih panjang.";
    case "shopee":
      return "Fokus pada manfaat produk, dorongan klik, dan ajakan yang terasa natural untuk konversi.";
    case "instagram":
      return "Buat copy ringkas, visual, dan enak dibaca untuk feed, reels, atau story.";
    case "lainnya":
      return "Pakai gaya umum yang fleksibel dan tetap natural untuk platform yang belum dispesifikkan.";
  }
}

function getContentDescriptor(language: ContentLanguage, contentType: ContentType) {
  return language === "en-US" ? EN_CONTENT_COPY[contentType] : CONTENT_CONFIG[contentType];
}

function tonePromptLabel(language: ContentLanguage, tone: string): string {
  if (language === "en-US") {
    if (tone === "enerjik") return "energetic";
    if (tone === "informatif") return "informative";
    if (tone === "hangat") return "warm";
    if (tone === "tegas") return "assertive";
  }
  return tone;
}

function buildClosingInstruction(input: PromptInput): string {
  if (input.ctaText?.trim()) {
    return input.contentLanguage === "en-US"
      ? `Use this CTA naturally near the ending: "${input.ctaText.trim()}".`
      : `Gunakan CTA berikut secara natural di bagian akhir: "${input.ctaText.trim()}".`;
  }

  const ctaIntensity = CONTENT_CONFIG[input.contentType].ctaIntensity;
  if (input.contentLanguage === "en-US") {
    if (ctaIntensity === "high") {
      return "Close with a light but relevant call to action without sounding pushy.";
    }
    if (ctaIntensity === "medium") {
      return "A soft closing CTA is allowed if it fits the flow.";
    }
    return "Close naturally without a hard-sell ending.";
  }

  if (ctaIntensity === "high") {
    return "Tutup dengan ajakan ringan yang relevan, tanpa terasa memaksa.";
  }
  if (ctaIntensity === "medium") {
    return "Penutup boleh berupa ajakan lembut bila cocok dengan alur.";
  }
  return "Tutup secara natural tanpa hard-sell.";
}

function buildReferenceLine(language: ContentLanguage, referenceLink?: string): string {
  if (language === "en-US") {
    return referenceLink?.trim()
      ? `Additional reference: ${referenceLink.trim()}`
      : "Additional reference: none";
  }
  return referenceLink?.trim()
    ? `Referensi tambahan: ${referenceLink.trim()}`
    : "Referensi tambahan: tidak ada";
}

function buildContextLines(input: PromptInput): string[] {
  const contentLabel = getContentLabel(input.contentLanguage, input.contentType);
  const platformLabel = getPlatformLabel(input.contentLanguage, input.socialPlatform);
  const toneLabel = tonePromptLabel(input.contentLanguage, input.tone);

  if (input.contentLanguage === "en-US") {
    return [
      `Content category: ${contentLabel}`,
      `Target social platform: ${platformLabel}`,
      `Platform direction: ${socialPlatformGuidance(input.contentLanguage, input.socialPlatform)}`,
      `Title/topic: ${input.title}`,
      `Brief/description: ${input.description.trim() || "no additional brief"}`,
      buildReferenceLine(input.contentLanguage, input.referenceLink),
      `Requested tone: ${toneLabel}.`,
      `Requested voice talent: ${voiceGenderLabel(input.contentLanguage, input.voiceGender)}.`,
      `Safety mode: ${input.settings.safetyMode}`,
      `Video duration: ${input.videoDurationSec.toFixed(2)} seconds.`,
      `Output language: English (en-US).`
    ];
  }

  return [
    `Kategori konten: ${contentLabel}`,
    `Platform medsos target: ${platformLabel}`,
    `Arah platform: ${socialPlatformGuidance(input.contentLanguage, input.socialPlatform)}`,
    `Judul/topik: ${input.title}`,
    `Brief/deskripsi: ${input.description.trim() || "tidak ada brief tambahan"}`,
    buildReferenceLine(input.contentLanguage, input.referenceLink),
    `Tone yang diminta client: ${toneLabel}.`,
    `Voice talent yang diminta: ${voiceGenderLabel(input.contentLanguage, input.voiceGender)}.`,
    `Batas safety mode: ${input.settings.safetyMode}`,
    `Durasi video: ${input.videoDurationSec.toFixed(2)} detik.`,
    "Output language: Bahasa Indonesia (id-ID)."
  ];
}

function formatVisualBrief(visualBrief: VisualBrief): string {
  return JSON.stringify(visualBrief, null, 2);
}

function buildVisualSourceLines(input: PromptInput, visualBrief?: VisualBrief): string[] {
  if (!visualBrief) {
    if (input.contentLanguage === "en-US") {
      return [
        "Visual source:",
        input.frameCount
          ? `- You received ${input.frameCount} image frames sampled evenly from the video. Analyze them together as the visual flow representation.`
          : "- The video will be analyzed directly with this prompt.",
        "- Follow the visual order from beginning to end without skipping scenes.",
        "- Mention only details that are clearly visible or audible.",
        "- If a detail is ambiguous, use safe and generic wording instead of guessing."
      ];
    }

    return [
      "Sumber visual:",
      input.frameCount
        ? `- Anda dikirimkan ${input.frameCount} frame gambar (sampling merata) dari video ini. Analisis semuanya sekaligus sebagai representasi alur visual video.`
        : "- Video akan dianalisis langsung bersama prompt ini.",
      "- Ikuti urutan visual dari awal sampai akhir tanpa loncat adegan.",
      "- Sebut hanya detail yang benar-benar terlihat atau terdengar jelas dari video.",
      "- Jika ada detail ambigu, gunakan deskripsi generik dan aman; jangan menebak."
    ];
  }

  return input.contentLanguage === "en-US"
    ? [
        "Official visual source (use this as the grounding source for the voice over/caption and do not add details outside it):",
        formatVisualBrief(visualBrief)
      ]
    : [
        "Sumber visual resmi (gunakan sebagai dasar voice over/caption dan jangan menambah detail di luar ini):",
        formatVisualBrief(visualBrief)
      ];
}

function buildCaptionSourceLines(input: CaptionPromptInput): string[] {
  if (input.scriptMode === "manual_script") {
    return input.contentLanguage === "en-US"
      ? [
          "Primary caption source:",
          "- This mode uses the user's manual script as the primary copy source.",
          "- Adjust the caption style with the content category, platform, and requested tone from the job metadata.",
          "- Do not invent new visual details, on-screen text, product benefits, or situations outside the manual script."
        ]
      : [
          "Sumber utama caption:",
          "- Mode ini memakai script manual dari user sebagai sumber utama copy.",
          "- Sesuaikan gaya caption dengan kategori, platform, dan tone dari metadata job.",
          "- Jangan mengarang detail visual, teks layar, manfaat produk, atau situasi baru di luar naskah manual."
        ];
  }

  return buildVisualSourceLines(input, input.visualBrief);
}

export function buildVisualBriefPrompt(input: PromptInput): string {
  const beats = estimateVisualBeatRange(input.videoDurationSec);
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

  if (input.contentLanguage === "en-US") {
    return [
      "You are a structured visual analyst for short-form video.",
      "Your task is to create a structured visual brief that will be used to write the voice over and caption.",
      input.frameCount
        ? `- You received ${input.frameCount} frames sampled evenly from a ${input.videoDurationSec} second video. Use that spacing to estimate timestamps reasonably.`
        : "",
      "The job metadata below is only goal context. If metadata conflicts with the video, prioritize visual evidence from the frames.",
      "Important rules:",
      "- Analyze only from visual or audio evidence that is truly present in the video.",
      "- Do not guess brands, locations, product benefits, usage outcomes, personal identities, or on-screen text if they are not clearly visible.",
      `- Break the video into ${beats.min}-${beats.max} sequential beats that cover the full duration.`,
      "- Each beat must describe the primary visual, the action or change, any clearly visible on-screen text, the narration focus, and claims to avoid.",
      "- Mark the strongest visual hook for the opening voice over.",
      "- If any detail is ambiguous, place it in uncertainties and do not treat it as fact.",
      "- Return valid JSON only, with no markdown, code fence, or extra explanation.",
      "",
      "Use this JSON structure:",
      JSON.stringify(schemaExample, null, 2),
      "",
      ...buildContextLines(input)
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Anda adalah analis visual video berbahasa Indonesia.",
    "Tugas Anda adalah membuat visual brief terstruktur yang akan dipakai untuk menulis voice over dan caption.",
    input.frameCount
      ? `- Anda dikirimkan total ${input.frameCount} frame gambar yang diambil secara merata dari video berdurasi ${input.videoDurationSec} detik. Gunakan informasi ini untuk menentukan timestamp secara masuk akal.`
      : "",
    "Metadata job di bawah hanya konteks tujuan konten. Jika metadata bertentangan dengan video, prioritaskan bukti visual dari frame.",
    "Aturan penting:",
    "- Analisis hanya berdasarkan bukti visual yang benar-benar ada di video.",
    "- Jangan menebak merek, lokasi, manfaat produk, hasil penggunaan, identitas orang, atau teks layar bila tidak terlihat jelas.",
    `- Pecah video menjadi ${beats.min}-${beats.max} beat berurutan yang menutup seluruh durasi.`,
    "- Setiap beat wajib menjelaskan visual utama, aksi/perubahan, teks layar yang jelas terlihat, fokus narasi, dan klaim yang harus dihindari.",
    "- Tandai momen hook visual terbaik untuk pembuka voice over.",
    "- Jika ada detail ambigu, masukkan ke uncertainties; jangan jadikan fakta.",
    "- Kembalikan JSON valid saja tanpa markdown, code fence, atau teks tambahan.",
    "",
    "Gunakan struktur JSON berikut:",
    JSON.stringify(schemaExample, null, 2),
    "",
    ...buildContextLines(input)
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildScriptPrompt(input: ScriptPromptInput): string {
  const words = estimateWordRange(input.videoDurationSec);
  const content = getContentDescriptor(input.contentLanguage, input.contentType);
  const toneLabel = tonePromptLabel(input.contentLanguage, input.tone);

  if (input.contentLanguage === "en-US") {
    return [
      "You are a short-form video voice over scriptwriter.",
      input.contentType === "affiliate"
        ? "Focus on writing an affiliate script that is persuasive, safe, natural, and faithful to the visuals."
        : "Focus on writing a general-content script that is natural, safe, pleasant to hear, and faithful to the visuals.",
      "Important rules:",
      "- Use natural English that is easy to speak aloud.",
      "- The opening line must work as a strong scroll-stopping hook.",
      "- The script must feel suitable for a real voice over performance.",
      "- Avoid medical, absolute, misleading, or exaggerated claims.",
      `- Target around ${words.target} words (range ${words.min}-${words.max}) so the narration fits a ${input.videoDurationSec.toFixed(2)} second video.`,
      `- Hook style: ${content.hookStyle}.`,
      `- Content direction: ${content.briefFocus}.`,
      `- Delivery character: ${content.deliveryStyle}.`,
      `- Requested tone: ${toneLabel}.`,
      `- Requested voice talent: ${voiceGenderLabel(input.contentLanguage, input.voiceGender)}.`,
      `- ${buildClosingInstruction(input)}`,
      "- The narration must follow the visual order from start to finish precisely.",
      "- The opening hook must reference the strongest visible moment that is actually present.",
      "- Do not add unsupported product claims, locations, benefits, outcomes, identities, or situations.",
      "- If any detail is ambiguous, use safe and generic phrasing instead of inventing specifics.",
      "- If a visual brief is provided, obey the timeline, mustMention, mustAvoid, and avoidClaims for each beat.",
      "",
      ...buildContextLines(input),
      "",
      ...buildVisualSourceLines(input, input.visualBrief),
      "",
      "Return one final script only, with no markdown, numbering, or extra notes."
    ].join("\n");
  }

  return [
    "Anda adalah penulis naskah voice over video berbahasa Indonesia.",
    input.contentType === "affiliate"
      ? "Fokus Anda adalah naskah affiliate yang persuasif, aman, natural, dan akurat terhadap visual."
      : "Fokus Anda adalah naskah general content yang natural, aman, enak didengar, dan akurat terhadap visual.",
    "Aturan penting:",
    "- Gunakan Bahasa Indonesia yang natural dan mudah diucapkan.",
    "- Kalimat pembuka wajib menjadi hook kuat agar penonton berhenti scroll.",
    "- Naskah harus cocok dibacakan sebagai voice over untuk video ini.",
    "- Hindari klaim medis, absolut, menyesatkan, atau berlebihan.",
    `- Panjang naskah sekitar ${words.target} kata (rentang ${words.min}-${words.max} kata) agar pas untuk durasi video ${input.videoDurationSec.toFixed(2)} detik.`,
    `- Gaya hook: ${content.hookStyle}.`,
    `- Arah isi: ${content.briefFocus}.`,
    `- Karakter delivery: ${content.deliveryStyle}.`,
    `- Tone yang diminta client: ${toneLabel}.`,
    `- Voice talent yang diminta: ${voiceGenderLabel(input.contentLanguage, input.voiceGender)}.`,
    `- ${buildClosingInstruction(input)}`,
    "- Narasi wajib mengikuti urutan visual dari awal sampai akhir secara presisi.",
    "- Hook pembuka harus merujuk ke momen visual paling kuat yang benar-benar tampak.",
    "- Jangan menambahkan klaim produk, lokasi, manfaat, hasil penggunaan, identitas orang, atau situasi yang tidak didukung visual.",
    "- Jika ada detail ambigu, gunakan frasa generik dan aman; jangan membuat detail spesifik.",
    "- Jika memakai visual brief, patuhi timeline, mustMention, mustAvoid, dan avoidClaims di tiap beat.",
    "",
    ...buildContextLines(input),
    "",
    ...buildVisualSourceLines(input, input.visualBrief),
    "",
    "Bangun satu naskah final saja tanpa markdown, tanpa penomoran, dan tanpa penjelasan tambahan."
  ].join("\n");
}

export function buildCaptionPrompt(input: CaptionPromptInput): string {
  const content = getContentDescriptor(input.contentLanguage, input.contentType);
  const isManualScript = input.scriptMode === "manual_script";

  if (input.contentLanguage === "en-US") {
    return [
      "You are a social media caption writer for short-form video.",
      input.contentType === "affiliate"
        ? "Focus on creating an affiliate caption that is engaging, safe, natural, and aligned with the visuals."
        : "Focus on creating a general-content caption that is engaging, safe, natural, and aligned with the visuals.",
      "Important rules:",
      "- The caption must feel like social copy, not a voice over script.",
      "- Use natural, concise, and relevant English.",
      "- Keep the requested tone and align it with the content category.",
      isManualScript
        ? "- The caption must stay aligned with the user's manual script and must not change its main angle."
        : "- The caption must follow the same hook and primary visual angle as the script or visual brief.",
      isManualScript
        ? "- Use the platform metadata to adjust style, not to invent new story details."
        : "- Do not create a caption angle that contradicts what is visible in the video.",
      isManualScript
        ? "- Do not add claims, benefits, situations, or on-screen text details that are not present in the manual script."
        : "- Do not add claims, benefits, situations, or on-screen text that are not supported by the visuals.",
      "- Avoid markdown, extra explanations, code fences, and labels.",
      "- The `caption` field must not contain hashtags.",
      "- The `hashtags` field must contain safe and relevant hashtags.",
      '- Return valid JSON only in this format: {"caption":"...","hashtags":["#tag1","#tag2"]}.',
      "",
      `Hook style: ${content.hookStyle}.`,
      `Content direction: ${content.briefFocus}.`,
      `Delivery character: ${content.deliveryStyle}.`,
      ...buildContextLines(input),
      `Voice over script reference: ${input.scriptText}`,
      "",
      ...buildCaptionSourceLines(input),
      "",
      "Make sure the caption is concise, easy to read, and ready to post."
    ].join("\n");
  }

  return [
    "Anda adalah penulis caption media sosial untuk video berbahasa Indonesia.",
    input.contentType === "affiliate"
      ? "Fokus Anda adalah membuat caption affiliate yang menarik, aman, natural, dan selaras dengan visual."
      : "Fokus Anda adalah membuat caption general content yang engaging, aman, natural, dan selaras dengan visual.",
    "Aturan penting:",
    "- Caption harus terasa seperti copy postingan sosial, bukan naskah voice over.",
    "- Gunakan Bahasa Indonesia yang natural, ringkas, dan relevan dengan video.",
    "- Pertahankan tone yang diminta client dan sesuaikan dengan kategori konten.",
    isManualScript
      ? "- Caption harus mengikuti isi script manual yang diberikan user dan tidak boleh mengubah angle utamanya."
      : "- Caption harus mengikuti hook dan visual utama yang sama dengan script/visual brief.",
    isManualScript
      ? "- Gunakan metadata platform untuk menyesuaikan gaya penulisan, bukan untuk menambah cerita baru."
      : "- Jangan membuat angle caption yang bertentangan dengan apa yang terlihat di video.",
    isManualScript
      ? "- Jangan menambah klaim, manfaat, situasi, atau teks layar spesifik yang tidak tertulis di script manual."
      : "- Jangan menambah klaim, manfaat, situasi, atau teks layar yang tidak didukung visual.",
    "- Hindari markdown, penjelasan tambahan, code fence, dan label apa pun.",
    "- Field `caption` tidak boleh berisi hashtag.",
    "- Field `hashtags` berisi hashtag relevan dan aman untuk video ini.",
    '- Kembalikan JSON valid saja dengan format: {"caption":"...","hashtags":["#tag1","#tag2"]}.',
    "",
    `Gaya hook video: ${content.hookStyle}.`,
    `Arah isi: ${content.briefFocus}.`,
    `Karakter delivery: ${content.deliveryStyle}.`,
    ...buildContextLines(input),
    `Referensi naskah voice over: ${input.scriptText}`,
    "",
    ...buildCaptionSourceLines(input),
    "",
    "Pastikan caption singkat, enak dibaca, dan cocok dipakai langsung untuk posting."
  ].join("\n");
}

export function buildGeminiTtsPrompt(input: {
  text: string;
  speechRate: number;
  contentLanguage: ContentLanguage;
  deliveryHint?: string;
}): string {
  if (input.contentLanguage === "en-US") {
    const paceInstruction =
      input.speechRate >= 1.1
        ? "Pace: slightly faster, still clear and never rushed."
        : input.speechRate <= 0.9
          ? "Pace: slightly slower, still natural and not flat."
          : "Pace: natural for short-form voice over.";
    const deliveryInstruction = input.deliveryHint?.trim()
      ? `Additional nuance: ${input.deliveryHint.trim()}.`
      : "Additional nuance: natural, clear, warm, and comfortable for English-speaking short-form viewers.";

    return [
      "You are a short-form video voice over narrator.",
      "Language: English (en-US).",
      "Accent: neutral, natural, and easy to understand.",
      "Style: realistic, warm, and suitable for social video voice over.",
      paceInstruction,
      deliveryInstruction,
      "Pronunciation: prioritize natural spoken English instead of robotic delivery.",
      "Read the following text exactly as written without adding extra words:",
      "",
      input.text
    ].join("\n");
  }

  const paceInstruction =
    input.speechRate >= 1.1
      ? "Pace: sedikit cepat, tetap jelas dan tidak terburu-buru."
      : input.speechRate <= 0.9
        ? "Pace: sedikit lebih pelan, tetap natural dan tidak datar."
        : "Pace: natural untuk voice over video pendek.";
  const deliveryInstruction = input.deliveryHint?.trim()
    ? `Nuansa tambahan: ${input.deliveryHint.trim()}.`
    : "Nuansa tambahan: natural, jelas, dan enak didengar untuk penonton Indonesia.";

  return [
    "Narator voice over video berbahasa Indonesia.",
    "Language: Bahasa Indonesia (id-ID).",
    "Accent: penutur asli Indonesia, natural, jelas, dan tidak kaku.",
    "Style: realistis, hangat, dan cocok untuk voice over video pendek.",
    paceInstruction,
    deliveryInstruction,
    "Pronunciation: utamakan pelafalan kata Indonesia secara lokal, bukan aksen Inggris atau suara robotik.",
    "Bacakan teks berikut persis apa adanya tanpa menambah kalimat lain:",
    "",
    input.text
  ].join("\n");
}
