import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedSessionAssets,
  listCachedSessionIds,
  upsertCachedSessionAssets
} from "./generation-cache";

class FakeRequest<T> {
  result!: T;
  onerror: ((event: Event) => void) | null = null;
  onsuccess: ((event: Event) => void) | null = null;
}

class FakeTransaction {
  onerror: ((event: Event) => void) | null = null;
  oncomplete: ((event: Event) => void) | null = null;
  private finished = false;

  constructor(private readonly storeData: Map<string, unknown>) {}

  objectStore(): IDBObjectStore {
    const transaction = this;
    return {
      put(value: unknown) {
        const request = new FakeRequest<string>();
        queueMicrotask(() => {
          const sessionId = String((value as { sessionId?: string }).sessionId || "");
          transaction.storeData.set(sessionId, value);
          request.result = sessionId;
          request.onsuccess?.(new Event("success"));
          transaction.complete();
        });
        return request as unknown as IDBRequest<string>;
      },
      get(key: IDBValidKey) {
        const request = new FakeRequest<unknown>();
        queueMicrotask(() => {
          request.result = transaction.storeData.get(String(key));
          request.onsuccess?.(new Event("success"));
          transaction.complete();
        });
        return request as unknown as IDBRequest<unknown>;
      },
      getAllKeys() {
        const request = new FakeRequest<IDBValidKey[]>();
        queueMicrotask(() => {
          request.result = [...transaction.storeData.keys()];
          request.onsuccess?.(new Event("success"));
          transaction.complete();
        });
        return request as unknown as IDBRequest<IDBValidKey[]>;
      }
    } as IDBObjectStore;
  }

  private complete() {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.oncomplete?.(new Event("complete"));
  }
}

class FakeDatabase {
  private readonly storeData = new Map<string, unknown>();
  private readonly objectStoreNamesSet = new Set<string>();

  readonly objectStoreNames = {
    contains: (name: string) => this.objectStoreNamesSet.has(name)
  } as DOMStringList;

  createObjectStore(name: string): IDBObjectStore {
    this.objectStoreNamesSet.add(name);
    return {} as IDBObjectStore;
  }

  transaction(): IDBTransaction {
    return new FakeTransaction(this.storeData) as unknown as IDBTransaction;
  }

  close() {}
}

class FakeOpenRequest<T> extends FakeRequest<T> {
  onupgradeneeded: ((event: Event) => void) | null = null;
}

function createFakeIndexedDb(): IDBFactory {
  const database = new FakeDatabase();
  return {
    cmp(first: unknown, second: unknown) {
      return String(first).localeCompare(String(second));
    },
    async databases() {
      return [];
    },
    deleteDatabase() {
      return new FakeOpenRequest<undefined>() as unknown as IDBOpenDBRequest;
    },
    open() {
      const request = new FakeOpenRequest<IDBDatabase>();
      queueMicrotask(() => {
        request.result = database as unknown as IDBDatabase;
        request.onupgradeneeded?.(new Event("upgradeneeded"));
        request.onsuccess?.(new Event("success"));
      });
      return request as unknown as IDBOpenDBRequest;
    }
  } as unknown as IDBFactory;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: createFakeIndexedDb()
  });
});

describe("generation-cache", () => {
  it("persists and retrieves cached session assets", async () => {
    const record = {
      sessionId: "session-88",
      sourceVideoName: "source.mp4",
      sourceVideoType: "video/mp4",
      sourceVideoBlob: new Blob(["video"], { type: "video/mp4" }),
      audioBlob: new Blob(["audio"], { type: "audio/wav" }),
      audioMimeType: "audio/wav",
      renderedVideoBlob: new Blob(["final"], { type: "video/mp4" }),
      renderFileName: "final.mp4",
      updatedAt: "2026-05-28T09:00:00.000Z"
    };

    await upsertCachedSessionAssets(record);
    const loaded = await getCachedSessionAssets("session-88");

    expect(loaded?.sessionId).toBe("session-88");
    expect(loaded?.sourceVideoName).toBe("source.mp4");
    expect(loaded?.audioMimeType).toBe("audio/wav");
    expect(loaded?.renderFileName).toBe("final.mp4");
  });

  it("lists cached session ids from the browser store", async () => {
    await upsertCachedSessionAssets({
      sessionId: "session-a",
      sourceVideoName: "one.mp4",
      sourceVideoType: "video/mp4",
      sourceVideoBlob: new Blob(["one"], { type: "video/mp4" }),
      updatedAt: "2026-05-28T09:00:00.000Z"
    });
    await upsertCachedSessionAssets({
      sessionId: "session-b",
      sourceVideoName: "two.mp4",
      sourceVideoType: "video/mp4",
      sourceVideoBlob: new Blob(["two"], { type: "video/mp4" }),
      updatedAt: "2026-05-28T09:00:01.000Z"
    });

    const ids = await listCachedSessionIds();

    expect(ids).toEqual(["session-a", "session-b"]);
  });
});
