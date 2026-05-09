export async function readVideoDuration(file: File): Promise<number> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Browser tidak mendukung pembacaan durasi video.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const durationSec = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");

      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };

      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const duration = Number(video.duration);
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("Durasi video tidak bisa dibaca. Coba file lain."));
          return;
        }
        resolve(duration);
      };
      video.onerror = () => {
        cleanup();
        reject(new Error("Durasi video tidak bisa dibaca. Pastikan file videonya valid."));
      };
      video.src = objectUrl;
    });

    return durationSec;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
