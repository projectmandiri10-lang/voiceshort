function loadDurationFromElement<T extends HTMLMediaElement>(
  element: T,
  objectUrl: string
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const cleanup = () => {
      element.pause();
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(objectUrl);
    };

    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = Number(element.duration);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Durasi media tidak bisa dibaca."));
        return;
      }
      resolve(duration);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error("Media tidak bisa diproses di perangkat ini."));
    };
    element.src = objectUrl;
  });
}

export async function readBlobDuration(blob: Blob, kind: "video" | "audio"): Promise<number> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Sistem ini tidak mendukung pembacaan durasi media.");
  }

  const objectUrl = URL.createObjectURL(blob);
  const element = document.createElement(kind);
  return await loadDurationFromElement(element, objectUrl);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}
