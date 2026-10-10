// Small promise wrapper around the browser's built-in IndexedDB.
// Temporary home for data until the online database is hooked up.

type StoreName = "users" | "boats" | "decks" | "photos";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("boat-storage", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("users", { keyPath: "id" }).createIndex("email", "email", { unique: true });
      db.createObjectStore("boats", { keyPath: "id" }).createIndex("userId", "userId");
      db.createObjectStore("decks", { keyPath: "id" }).createIndex("boatId", "boatId");
      db.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

export async function get<T>(name: StoreName, id: string): Promise<T | undefined> {
  return wrap((await store(name)).get(id));
}

export async function getBy<T>(name: StoreName, index: string, key: string): Promise<T[]> {
  return wrap((await store(name)).index(index).getAll(key));
}

export async function put<T>(name: StoreName, value: T): Promise<void> {
  await wrap((await store(name, "readwrite")).put(value));
}

export async function del(name: StoreName, id: string): Promise<void> {
  await wrap((await store(name, "readwrite")).delete(id));
}
