export type BrowserIdentity = { deviceId: string; deviceSecret: string };

const DB_NAME = "queue-metro-identity";
const STORE_NAME = "identity";

function token(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function browserIdentity(): Promise<BrowserIdentity> {
  try {
    const db = await openDb();
    const current = await new Promise<BrowserIdentity | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get("current");
      request.onsuccess = () => resolve(request.result as BrowserIdentity | undefined);
      request.onerror = () => reject(request.error);
    });
    if (current?.deviceId && current.deviceSecret) return current;
    const created = { deviceId: `dev_${token(18)}`, deviceSecret: token(36) };
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(created, "current");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return created;
  } catch {
    const key = "queueMetroIdentity";
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as BrowserIdentity;
    const created = { deviceId: `dev_${token(18)}`, deviceSecret: token(36) };
    localStorage.setItem(key, JSON.stringify(created));
    return created;
  }
}
