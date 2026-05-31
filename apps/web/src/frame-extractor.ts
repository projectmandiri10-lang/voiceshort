import { FRAME_EXTRACTION_MAX_FRAMES, FRAME_EXTRACTION_MAX_WIDTH, FRAME_EXTRACTION_MIN_FRAMES } from "./shared/constants";
import type { ExtractedFrame } from "./types";

function toBase64FromDataUrl(dataUrl: string): string {
  const separatorIndex = dataUrl.indexOf(",");
  return separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl;
}

function buildFrameTimestamps(durationSec: number): number[] {
  const targetFrames = Math.min(
    FRAME_EXTRACTION_MAX_FRAMES,
    Math.max(FRAME_EXTRACTION_MIN_FRAMES, Math.ceil(durationSec / 3))
  );
  if (targetFrames <= 1) {
    return [0];
  }

  const lastSafeSecond = Math.max(0, durationSec - 0.12);
  return Array.from({ length: targetFrames }, (_, index) => {
    const progress = index / (targetFrames - 1);
    return Number((progress * lastSafeSecond).toFixed(2));
  });
}

function seekVideo(video: HTMLVideoElement, timestampSec: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Gagal mengambil cuplikan dari video."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = Math.max(0, timestampSec);
  });
}

export async function extractFramesFromVideo(
  file: File,
  options?: {
    durationSec?: number;
    onProgress?: (progressPercent: number) => void;
  }
): Promise<ExtractedFrame[]> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Sistem ini tidak mendukung analisis video.");
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Canvas 2D tidak tersedia di sistem ini.");
  }

  const cleanup = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  };

  try {
    const loadedDurationSec = await new Promise<number>((resolve, reject) => {
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = () => {
        const duration = Number(video.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("Durasi video tidak valid untuk analisis."));
          return;
        }
        resolve(duration);
      };
      video.onerror = () => {
        reject(new Error("Video tidak bisa dibuka untuk analisis."));
      };
      video.src = objectUrl;
    });

    const durationSec = options?.durationSec && Number.isFinite(options.durationSec)
      ? options.durationSec
      : loadedDurationSec;
    const timestamps = buildFrameTimestamps(durationSec);
    const scaleWidth = Math.max(1, Math.min(FRAME_EXTRACTION_MAX_WIDTH, video.videoWidth));
    const scaleHeight = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * scaleWidth));
    canvas.width = scaleWidth;
    canvas.height = scaleHeight;

    const frames: ExtractedFrame[] = [];
    for (let index = 0; index < timestamps.length; index += 1) {
      const timestampSec = timestamps[index] ?? 0;
      await seekVideo(video, timestampSec);
      context.drawImage(video, 0, 0, scaleWidth, scaleHeight);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.74);
      frames.push({
        index,
        timestampSec,
        mimeType: "image/jpeg",
        base64Data: toBase64FromDataUrl(dataUrl),
        dataUrl,
        width: scaleWidth,
        height: scaleHeight
      });
      options?.onProgress?.(Math.round(((index + 1) / timestamps.length) * 100));
    }

    return frames;
  } finally {
    cleanup();
  }
}
