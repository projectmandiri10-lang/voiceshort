import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffprobeStatic from "ffprobe-static";
import ffmpegStatic from "ffmpeg-static";

export function resolveFfprobeExecutable(options?: {
  fromEnv?: string;
  staticPath?: string | null;
  exists?: (filePath: string) => boolean;
}): string {
  const fromEnv = options?.fromEnv ?? process.env.FFPROBE_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const fromPackage = options?.staticPath ?? (ffprobeStatic as { path?: string }).path ?? null;
  const exists = options?.exists ?? existsSync;
  if (fromPackage && exists(fromPackage)) {
    return fromPackage;
  }

  // Fallback ke PATH sistem agar server ARM seperti OCI Ampere tetap aman.
  return "ffprobe";
}

export async function probeVideoDuration(
  filePath: string,
  options?: {
    ffprobePath?: string;
  }
): Promise<number> {
  const ffprobePath = options?.ffprobePath ?? resolveFfprobeExecutable();

  return new Promise<number>((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ];
    const process = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    process.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    process.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            `ffprobe tidak ditemukan (${ffprobePath}). Install ffprobe di server atau set env FFPROBE_PATH ke lokasi binary.`
          )
        );
        return;
      }
      reject(error);
    });
    process.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Gagal membaca durasi video: ${stderr || code}`));
        return;
      }
      const duration = Number(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Durasi video tidak valid."));
        return;
      }
      resolve(duration);
    });
  });
}

export function resolveFfmpegExecutable(): string {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  
  try {
    const fromPackage = (ffmpegStatic as unknown as string | null) ?? null;
    if (fromPackage && existsSync(fromPackage)) {
      return fromPackage;
    }
  } catch (err) {
    // ignore
  }

  return "ffmpeg";
}

export async function extractVideoFrames(
  videoPath: string,
  outputDir: string,
  options?: {
    fps?: number;
    ffmpegPath?: string;
  }
): Promise<string[]> {
  const ffmpegPath = options?.ffmpegPath ?? resolveFfmpegExecutable();
  const fps = options?.fps ?? 1;

  return new Promise<string[]>((resolve, reject) => {
    // We will extract frames as %04d.jpg
    const args = [
      "-y",
      "-i",
      videoPath,
      "-vf",
      `fps=${fps},scale='min(512,iw)':-1`,
      "-qscale:v",
      "10",
      `${outputDir}/frame-%04d.jpg`
    ];

    const process = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    process.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            `ffmpeg tidak ditemukan (${ffmpegPath}). Install ffmpeg di server atau set env FFMPEG_PATH.`
          )
        );
        return;
      }
      reject(error);
    });

    process.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Gagal mengekstrak frame video: ${stderr || code}`));
        return;
      }
      
      // We read the output directory to get the list of generated files
      import("node:fs/promises").then((fs) => {
        fs.readdir(outputDir).then((files) => {
          const frameFiles = files
            .filter((f) => f.startsWith("frame-") && f.endsWith(".jpg"))
            .map((f) => import("node:path").then((path) => path.join(outputDir, f)));
          Promise.all(frameFiles).then(resolve).catch(reject);
        }).catch(reject);
      });
    });
  });
}
