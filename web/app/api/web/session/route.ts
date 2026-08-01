import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { webDevices, webSessions } from "@/db/schema";
import { SESSION_COOKIE, secretsMatch } from "@/lib/auth";
import { jsonError, newId, randomToken, readJson, sha256, WEB_SESSION_TTL_MS } from "@/lib/security";

type Payload = { deviceId?: string; deviceSecret?: string };

export async function POST(request: Request) {
  try {
    const { value } = await readJson<Payload>(request);
    const deviceId = value.deviceId?.trim() ?? "";
    const deviceSecret = value.deviceSecret ?? "";
    const db = getDb();
    const [device] = await db.select().from(webDevices)
      .where(and(eq(webDevices.id, deviceId), eq(webDevices.status, "allowed"))).limit(1);
    if (!device || !secretsMatch(device.secretHash, await sha256(deviceSecret))) {
      return jsonError("此瀏覽器尚未獲授權", 403, "device_not_allowed");
    }
    const now = Date.now();
    const token = randomToken(32);
    await db.delete(webSessions).where(and(eq(webSessions.deviceId, deviceId), gt(webSessions.expiresAt, 0)));
    await db.insert(webSessions).values({
      id: newId("ses"),
      tokenHash: await sha256(token),
      deviceId,
      createdAt: now,
      expiresAt: now + WEB_SESSION_TTL_MS,
      lastSeenAt: now,
    });
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return new Response(JSON.stringify({ state: "allowed", expiresAt: now + WEB_SESSION_TTL_MS }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400${secure}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法建立登入工作階段", 500);
  }
}
