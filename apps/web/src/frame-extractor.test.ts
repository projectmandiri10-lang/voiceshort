import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFramesFromVideo } from "./frame-extractor";

describe("extractFramesFromVideo", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
  });

  it("extracts JPEG frames from a local video using canvas", async () => {
    const progressUpdates: number[] = [];
    const revokeSpy = vi.fn();
    const drawImage = vi.fn();
    let exportCount = 0;
    const listeners = new Map<string, Set<() => void>>();

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL: vi.fn(() => {
        exportCount += 1;
        return `data:image/jpeg;base64,frame-${exportCount}`;
      })
    };

    const mockVideo = {
      duration: 9,
      videoWidth: 1280,
      videoHeight: 720,
      preload: "auto",
      muted: true,
      playsInline: true,
      onloadeddata: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      addEventListener(type: string, handler: () => void) {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type)?.add(handler);
      },
      removeEventListener(type: string, handler: () => void) {
        listeners.get(type)?.delete(handler);
      }
    };

    let currentTimeValue = 0;
    Object.defineProperty(mockVideo, "currentTime", {
      get() {
        return currentTimeValue;
      },
      set(value: number) {
        currentTimeValue = value;
        queueMicrotask(() => {
          listeners.get("seeked")?.forEach((handler) => handler());
        });
      }
    });

    let srcValue = "";
    Object.defineProperty(mockVideo, "src", {
      get() {
        return srcValue;
      },
      set(value: string) {
        srcValue = value;
        queueMicrotask(() => {
          mockVideo.onloadeddata?.(new Event("loadeddata"));
        });
      }
    });

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "video") {
        return mockVideo as unknown as HTMLVideoElement;
      }
      if (tagName === "canvas") {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    URL.createObjectURL = vi.fn(() => "blob:video-local");
    URL.revokeObjectURL = revokeSpy;

    const frames = await extractFramesFromVideo(new File(["video"], "source.mp4", { type: "video/mp4" }), {
      durationSec: 9,
      onProgress: (progress) => {
        progressUpdates.push(progress);
      }
    });

    expect(frames).toHaveLength(6);
    expect(frames[0]?.mimeType).toBe("image/jpeg");
    expect(frames[0]?.base64Data).toBe("frame-1");
    expect(frames[5]?.base64Data).toBe("frame-6");
    expect(frames.every((frame) => frame.width === 448 && frame.height === 252)).toBe(true);
    expect(progressUpdates.at(-1)).toBe(100);
    expect(drawImage).toHaveBeenCalledTimes(6);
    expect(revokeSpy).toHaveBeenCalledWith("blob:video-local");
  });
});
