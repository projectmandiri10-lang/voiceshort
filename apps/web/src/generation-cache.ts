import type { CachedGenerationSessionRecord } from "./types";

const DB_NAME = "voiceshort-local-generation";
const DB_VERSION = 1;
const STORE_NAME = "session-assets";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB tidak tersedia di browser ini.");
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error("Gagal membuka cache lokal browser."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const database = await openDatabase();
  return await new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);
    transaction.onerror = () => reject(new Error("Gagal menyimpan data render lokal."));
    transaction.oncomplete = () => resolve((request as IDBRequest<T> | undefined)?.result);
  }).finally(() => {
    database.close();
  });
}

export async function upsertCachedSessionAssets(
  record: CachedGenerationSessionRecord
): Promise<void> {
  await withStore("readwrite", (store) => store.put(record));
}

export async function getCachedSessionAssets(
  sessionId: string
): Promise<CachedGenerationSessionRecord | undefined> {
  return (await withStore<CachedGenerationSessionRecord>("readonly", (store) =>
    store.get(sessionId)
  )) as CachedGenerationSessionRecord | undefined;
}

export async function listCachedSessionIds(): Promise<string[]> {
  const database = await openDatabase();
  return await new Promise<string[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onerror = () => reject(new Error("Gagal membaca daftar cache lokal."));
    request.onsuccess = () => {
      resolve(request.result.map((item) => String(item)));
    };
  }).finally(() => {
    database.close();
  });
}
