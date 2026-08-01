const STORES_URL = "https://sushipass.sushiro.com.hk/api/2.0/info/storelist?latitude=22&longitude=114&numresults=100&region=HK";
const QUEUES_URL = "https://sushipass.sushiro.com.hk/api/2.0/remote/groupqueues";

type StoreSource = Record<string, unknown>;

export type WebStore = {
  id: number;
  name: string;
  nameEn: string;
  district: string;
  region: "港島" | "九龍" | "新界";
  latitude: number | null;
  longitude: number | null;
  waitingGroups: number | null;
  isOpen: boolean | null;
};

function text(record: StoreSource, key: string): string {
  const value = record[key];
  return value === null || value === undefined ? "" : String(value).trim();
}

function numeric(record: StoreSource, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(text(record, key));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function regionOf(value: string): WebStore["region"] {
  const normalized = value.toLowerCase();
  if (/hong kong|港島|中西區|灣仔|東區|南區/u.test(normalized)) return "港島";
  if (/new territories|新界|離島|荃灣|屯門|元朗|北區|大埔|沙田|西貢|葵青/u.test(normalized)) return "新界";
  return "九龍";
}

async function cachedJson(url: string, ttlSeconds: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "QueueMetro-Web/1.2" },
    cf: { cacheEverything: true, cacheTtl: ttlSeconds },
  } as RequestInit);
  if (!response.ok) throw new Error(`Official service returned ${response.status}`);
  return response.json();
}

export async function fetchStores(): Promise<WebStore[]> {
  const payload = await cachedJson(STORES_URL, 60);
  const rows = Array.isArray(payload) ? payload : (payload as { stores?: unknown[] })?.stores ?? [];
  return rows.flatMap((entry): WebStore[] => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as StoreSource;
    const id = numeric(record, "id");
    if (id === null) return [];
    const district = text(record, "district") || text(record, "area") || "其他";
    const status = text(record, "storeStatus");
    return [{
      id,
      name: text(record, "name") || "未命名分店",
      nameEn: text(record, "nameEn"),
      district,
      region: regionOf(`${text(record, "region")} ${district} ${text(record, "address")}`),
      latitude: numeric(record, "latitude", "lat"),
      longitude: numeric(record, "longitude", "lng"),
      waitingGroups: numeric(record, "waitingGroup", "wait"),
      isOpen: status ? status.toUpperCase() === "OPEN" : null,
    }];
  });
}

function queueNumbers(payload: Record<string, unknown>): string[] {
  const arrays = Array.isArray(payload.mixedQueue) ? [payload.mixedQueue]
    : Array.isArray(payload.storeQueue) ? [payload.storeQueue]
      : [payload.boothQueue, payload.counterQueue].filter(Array.isArray);
  const result: string[] = [];
  for (const array of arrays as unknown[][]) {
    for (const value of array) {
      const number = value && typeof value === "object"
        ? ["queueNo", "queueNumber", "number", "ticket"]
          .map((key) => (value as Record<string, unknown>)[key])
          .find((item) => item !== null && item !== undefined && String(item).trim())
        : value;
      if (number !== null && number !== undefined && String(number).trim()) result.push(String(number).trim());
    }
  }
  return [...new Set(result)];
}

export async function fetchQueue(storeId: number) {
  const payload = await cachedJson(`${QUEUES_URL}?region=HK&storeid=${encodeURIComponent(storeId)}`, 60);
  return { storeId, currentNumbers: queueNumbers(payload as Record<string, unknown>), fetchedAt: Date.now() };
}
