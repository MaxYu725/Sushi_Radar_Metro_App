import { authorizedDevice } from "@/lib/auth";
import { jsonError } from "@/lib/security";
import { fetchQueue } from "@/lib/queue-source";

export async function GET(request: Request) {
  if (!await authorizedDevice(request)) return jsonError("需要已授權的瀏覽器", 401, "web_authorization_required");
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 20);
  if (ids.length === 0) return jsonError("請提供分店編號", 400, "store_ids_required");
  const results = [];
  for (let index = 0; index < ids.length; index += 3) {
    const batch = await Promise.allSettled(ids.slice(index, index + 3).map(fetchQueue));
    results.push(...batch.map((result, offset) => result.status === "fulfilled"
      ? result.value
      : { storeId: ids[index + offset], currentNumbers: [], fetchedAt: Date.now(), stale: true }));
  }
  return Response.json({ queues: results }, { headers: { "cache-control": "private, max-age=45" } });
}
