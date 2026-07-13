import { FINAL_AUDIO_BITRATE, FINAL_AUDIO_SAMPLE_RATE, FINAL_VIDEO_CRF, FINAL_VIDEO_FPS, FINAL_VIDEO_MAX_DIMENSION, FINAL_VOICE_LOUDNORM } from "./shared/constants";
import { buildTimedSubtitleCues } from "./subtitle-utils";
import { calculateAudioFit } from "./shared/speech-timing";

const FFMPEG_CORE_VERSION = "0.12.10";

function toPlainArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const clone = new Uint8Array(bytes.byteLength);
  clone.set(bytes);
  return clone.buffer;
}

function buildAtempoFilter(targetFactor: number): string {
  let factor = Math.max(0.01, targetFactor);
  const filters: string[] = [];

  while (factor > 2) {
    filters.push("atempo=2");
    factor /= 2;
  }
  while (factor < 0.5) {
    filters.push("atempo=0.5");
    factor /= 0.5;
  }
  filters.push(`atempo=${factor.toFixed(6)}`);
  return filters.join(",");
}

function buildVideoCompressionFilter(): string {
  return [
    `fps=${FINAL_VIDEO_FPS}`,
    [
      "scale=",
      `w='if(gte(iw,ih),trunc(min(iw\\,${FINAL_VIDEO_MAX_DIMENSION})/2)*2,-2)'`,
      ":",
      `h='if(gte(iw,ih),-2,trunc(min(ih\\,${FINAL_VIDEO_MAX_DIMENSION})/2)*2)'`
    ].join(""),
    "setsar=1"
  ].join(",");
}

export function resolveUploadedAudioPath(fileName?: string): string {
  const extension = /\.(wav|mp3|m4a|mp4|ogg)$/i.exec(fileName || "")?.[1]?.toLowerCase() || "wav";
  return `uploaded-voice.${extension}`;
}

function escapeDrawtextText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function buildSubtitleFilterChain(scriptText: string, totalDurationSec: number): string {
  const cues = buildTimedSubtitleCues(scriptText, totalDurationSec);
  if (!cues.length) {
    return "";
  }

  const filters: string[] = [];
  for (const cue of cues) {
    cue.lines.forEach((line, lineIndex) => {
      const yExpression =
        cue.lines.length > 1
          ? lineIndex === 0
            ? "h-(text_h*4.4)-44"
            : "h-(text_h*2.2)-28"
          : "h-(text_h*2.4)-34";
      filters.push(
        [
          "drawtext=",
          `text='${escapeDrawtextText(line)}'`,
          "fontcolor=white",
          "fontsize=h*0.044",
          "line_spacing=10",
          "borderw=4",
          "bordercolor=black@0.82",
          "box=1",
          "boxcolor=black@0.18",
          "boxborderw=18",
          "x=(w-text_w)/2",
          `y=${yExpression}`,
          `enable='between(t,${cue.startSec.toFixed(3)},${cue.endSec.toFixed(3)})'`,
        ].join(":")
      );
    });
  }
  return filters.join(",");
}

export function buildFinalMuxArgs(input: {
  sourceVideoPath: string;
  voiceWavPath: string;
  outputVideoPath: string;
  targetDurationSec: number;
  voiceDurationSec: number;
  subtitleText?: string;
}): string[] {
  const safeTargetDurationSec = Math.max(1, input.targetDurationSec);
  const audioFit = calculateAudioFit(input.voiceDurationSec, safeTargetDurationSec);
  const targetDurationText = safeTargetDurationSec.toFixed(3);
  const videoFilter = buildVideoCompressionFilter();
  const subtitleFilter = input.subtitleText
    ? buildSubtitleFilterChain(input.subtitleText, safeTargetDurationSec)
    : "";
  const audioFilter = `${buildAtempoFilter(audioFit.tempoFactor)},${FINAL_VOICE_LOUDNORM},apad=whole_dur=${targetDurationText}`;
  const filterGraph = `[0:v:0]${videoFilter}${subtitleFilter ? `,${subtitleFilter}` : ""}[vout];[1:a]${audioFilter}[aout]`;

  return [
    "-y",
    "-i",
    input.sourceVideoPath,
    "-i",
    input.voiceWavPath,
    "-filter_complex",
    filterGraph,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    String(FINAL_VIDEO_CRF),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-c:a",
    "aac",
    "-b:a",
    FINAL_AUDIO_BITRATE,
    "-ar",
    String(FINAL_AUDIO_SAMPLE_RATE),
    "-ac",
    "1",
    "-t",
    targetDurationText,
    input.outputVideoPath
  ];
}

export async function renderFinalVideoLocally(input: {
  sourceVideo: File | Blob;
  audioWavBlob: Blob;
  audioFileName?: string;
  sourceVideoName?: string;
  subtitleText?: string;
  onLog?: (message: string) => void;
  onProgress?: (ratio: number) => void;
}): Promise<Blob> {
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util")
  ]);

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    input.onProgress?.(progress);
  });
  ffmpeg.on("log", ({ message }) => {
    input.onLog?.(message);
  });

  const baseUrl = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, "application/wasm")
  });

  const sourceVideoPath = input.sourceVideoName?.toLowerCase().endsWith(".mp4")
    ? input.sourceVideoName
    : "source.mp4";
  const audioName = input.audioFileName || (input.audioWavBlob instanceof File ? input.audioWavBlob.name : "");
  const voicePath = resolveUploadedAudioPath(audioName);
  const outputPath = "final.mp4";

  await ffmpeg.writeFile(sourceVideoPath, await fetchFile(input.sourceVideo));
  await ffmpeg.writeFile(voicePath, await fetchFile(input.audioWavBlob));

  const audioDurationSec = await estimateMediaDuration(input.audioWavBlob, "audio");
  const videoDurationSec = await estimateMediaDuration(input.sourceVideo, "video");

  await ffmpeg.exec(
    buildFinalMuxArgs({
      sourceVideoPath,
      voiceWavPath: voicePath,
      outputVideoPath: outputPath,
      targetDurationSec: videoDurationSec,
      voiceDurationSec: audioDurationSec,
      subtitleText: input.subtitleText,
    })
  );

  const outputData = await ffmpeg.readFile(outputPath);
  const outputBytes =
    typeof outputData === "string"
      ? new TextEncoder().encode(outputData)
      : outputData instanceof Uint8Array
        ? Uint8Array.from(outputData)
        : new Uint8Array(outputData as ArrayBufferLike);
  return new Blob([toPlainArrayBuffer(outputBytes)], { type: "video/mp4" });
}

async function estimateMediaDuration(blob: File | Blob, kind: "video" | "audio"): Promise<number> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Sistem ini tidak mendukung pembacaan durasi media.");
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<number>((resolve, reject) => {
      const element = document.createElement(kind);
      element.preload = "metadata";
      element.onloadedmetadata = () => {
        const duration = Number(element.duration);
        element.removeAttribute("src");
        element.load();
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("Durasi media tidak valid untuk finalisasi."));
          return;
        }
        resolve(duration);
      };
      element.onerror = () => {
        element.removeAttribute("src");
        element.load();
        reject(new Error("Media tidak bisa diproses untuk finalisasi."));
      };
      element.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
