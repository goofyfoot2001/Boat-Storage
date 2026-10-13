// The copy of boats kept on this device for offline use, in the browser's own database (IndexedDB).
//   snapshots: one record per boat — all its rows, as last downloaded
//   files:     photos and documents, keyed by "<bucket>/<path>"

const DB_NAME = "bsm-offline";
type StoreName = "snapshots" | "files";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("snapshots", { keyPath: "boatId" });
      req.result.createObjectStore("files", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode = "readonly") {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function get<T>(name: StoreName, key: string): Promise<T | undefined> {
  return wrap((await store(name)).get(key));
}
export async function getAll<T>(name: StoreName): Promise<T[]> {
  return wrap((await store(name)).getAll());
}
export async function allKeys(name: StoreName): Promise<string[]> {
  return wrap((await store(name)).getAllKeys()) as Promise<string[]>;
}
export async function put<T>(name: StoreName, value: T): Promise<void> {
  await wrap((await store(name, "readwrite")).put(value));
}
export async function remove(name: StoreName, key: string): Promise<void> {
  await wrap((await store(name, "readwrite")).delete(key));
}

export interface SavedFile { key: string; blob: Blob; size: number }
export const fileKey = (bucket: string, path: string) => `${bucket}/${path}`;
