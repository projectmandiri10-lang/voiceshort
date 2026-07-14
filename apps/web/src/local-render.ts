import {
  FINAL_AUDIO_BITRATE,
  FINAL_AUDIO_SAMPLE_RATE,
  FINAL_VIDEO_CRF,
  FINAL_VIDEO_MAX_DIMENSION,
  FINAL_VOICE_LOUDNORM
} from "./shared/constants";
import { calculateAudioFit } from "./shared/speech-timing";

const FFMPEG_CORE_VERSION = "0.12.10";

export type RenderPhase = "loading" | "fast_mux" | "fallback_encode";

interface MuxInput {
  sourceVideoPath: string;
  voicePath: string;
  outputVideoPath: string;
  targetDurationSec: number;
  voiceDurationSec: number;
}

interface FFmpegMuxExecutor {
  exec(args: string[]): Promise<number>;
  deleteFile(path: string): Promise<unknown>;
}

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

function buildAudioFilter(input: Pick<MuxInput, "targetDurationSec" | "voiceDurationSec">): string {
  const audioFit = calculateAudioFit(input.voiceDurationSec, input.targetDurationSec);
  return `${buildAtempoFilter(audioFit.tempoFactor)},${FINAL_VOICE_LOUDNORM},apad=whole_dur=${input.targetDurationSec.toFixed(3)}`;
}

function buildAudioOutputArgs(targetDurationText: string): string[] {
  return [
    "-map_metadata", "-1",
    "-c:a", "aac",
    "-b:a", FINAL_AUDIO_BITRATE,
    "-ar", String(FINAL_AUDIO_SAMPLE_RATE),
    "-ac", "1",
    "-t", targetDurationText
  ];
}

function buildVideoCompressionFilter(): string {
  return [
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

export function resolveSourceVideoPath(fileName?: string): string {
  const extension = /\.(mp4|mov|m4v|webm)$/i.exec(fileName || "")?.[1]?.toLowerCase() || "mp4";
  return `source.${extension}`;
}

export function buildFastMuxArgs(input: MuxInput): string[] {
  const targetDurationText = Math.max(1, input.targetDurationSec).toFixed(3);
  const filterGraph = `[1:a]${buildAudioFilter(input)}[aout]`;
  return [
    "-y", "-i", input.sourceVideoPath, "-i", input.voicePath,
    "-filter_complex", filterGraph,
    "-map", "0:v:0", "-map", "[aout]",
    "-c:v", "copy",
    "-movflags", "+faststart",
    ...buildAudioOutputArgs(targetDurationText),
    input.outputVideoPath
  ];
}

export function buildFallbackEncodeArgs(input: MuxInput): string[] {
  const targetDurationText = Math.max(1, input.targetDurationSec).toFixed(3);
  const filterGraph = `[0:v:0]${buildVideoCompressionFilter()}[vout];[1:a]${buildAudioFilter(input)}[aout]`;
  return [
    "-y", "-i", input.sourceVideoPath, "-i", input.voicePath,
    "-filter_complex", filterGraph,
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", String(FINAL_VIDEO_CRF),
    "-pix_fmt", "yuv420p",
    "-fps_mode", "passthrough",
    "-movflags", "+faststart",
    ...buildAudioOutputArgs(targetDurationText),
    input.outputVideoPath
  ];
}

export async function executeMuxWithFallback(
  ffmpeg: FFmpegMuxExecutor,
  input: MuxInput,
  onPhase?: (phase: Exclude<RenderPhase, "loading">) => void
): Promise<"fast_mux" | "fallback_encode"> {
  onPhase?.("fast_mux");
  const fastExitCode = await ffmpeg.exec(buildFastMuxArgs(input));
  if (fastExitCode === 0) return "fast_mux";

  await ffmpeg.deleteFile(input.outputVideoPath).catch(() => undefined);
  onPhase?.("fallback_encode");
  const fallbackExitCode = await ffmpeg.exec(buildFallbackEncodeArgs(input));
  if (fallbackExitCode !== 0) {
    throw new Error("Format video tidak dapat diproses menjadi MP4.");
  }
  return "fallback_encode";
}

export async function renderFinalVideoLocally(input: {
  sourceVideo: File | Blob;
  audioWavBlob: Blob;
  audioFileName?: string;
  sourceVideoName?: string;
  onLog?: (message: string) => void;
  onProgress?: (ratio: number) => void;
  onPhase?: (phase: RenderPhase) => void;
}): Promise<Blob> {
  input.onPhase?.("loading");
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util")
  ]);

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => input.onProgress?.(progress));
  ffmpeg.on("log", ({ message }) => input.onLog?.(message));

  const baseUrl = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, "application/wasm")
  });

  const sourceVideoPath = resolveSourceVideoPath(input.sourceVideoName);
  const audioName = input.audioFileName || (input.audioWavBlob instanceof File ? input.audioWavBlob.name : "");
  const voicePath = resolveUploadedAudioPath(audioName);
  const outputPath = "final.mp4";
  await ffmpeg.writeFile(sourceVideoPath, await fetchFile(input.sourceVideo));
  await ffmpeg.writeFile(voicePath, await fetchFile(input.audioWavBlob));

  const [audioDurationSec, videoDurationSec] = await Promise.all([
    estimateMediaDuration(input.audioWavBlob, "audio"),
    estimateMediaDuration(input.sourceVideo, "video")
  ]);
  await executeMuxWithFallback(ffmpeg, {
    sourceVideoPath,
    voicePath,
    outputVideoPath: outputPath,
    targetDurationSec: videoDurationSec,
    voiceDurationSec: audioDurationSec
  }, (phase) => input.onPhase?.(phase));

  const outputData = await ffmpeg.readFile(outputPath);
  const outputBytes = typeof outputData === "string"
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
