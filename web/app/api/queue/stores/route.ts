import { authorizedDevice } from "@/lib/auth";
import { jsonError } from "@/lib/security";
import { fetchStores } from "@/lib/queue-source";

export async function GET(request: Request) {
  if (!await authorizedDevice(request)) return jsonError("需要已授權的瀏覽器", 401, "web_authorization_required");
  try {
    const stores = await fetchStores();
    return Response.json({ stores, fetchedAt: Date.now() }, {
      headers: { "cache-control": "private, max-age=45" },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法讀取分店資料", 502, "official_service_error");
  }
}
