import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests, webDevices } from "@/db/schema";
import { enforceEnrollmentRateLimit, secretsMatch } from "@/lib/auth";
import { jsonError, newId, QR_TTL_MS, randomToken, readJson, sha256 } from "@/lib/security";

type Payload = { deviceId?: string; deviceSecret?: string; userAgent?: string };

export async function POST(request: Request) {
  try {
    const limited = await enforceEnrollmentRateLimit(request);
    if (limited) return limited;
    const { value } = await readJson<Payload>(request);
    const deviceId = value.deviceId?.trim() ?? "";
    const deviceSecret = value.deviceSecret ?? "";
    if (!/^dev_[A-Za-z0-9_-]{16,100}$/u.test(deviceId) || deviceSecret.length < 32 || deviceSecret.length > 256) {
      return jsonError("瀏覽器身分格式無效", 400, "device_identity_invalid");
    }
    const secretHash = await sha256(deviceSecret);
    const db = getDb();
    const now = Date.now();
    const [device] = await db.select().from(webDevices).where(eq(webDevices.id, deviceId)).limit(1);
    if (device && !secretsMatch(device.secretHash, secretHash)) {
      return jsonError("瀏覽器密鑰不符", 401, "device_secret_invalid");
    }
    if (device?.status === "blocked") return jsonError("此瀏覽器身分已被封鎖", 403, "device_blocked");
    if (device?.status === "allowed") return Response.json({ state: "allowed" });

    const [latest] = await db.select().from(approvalRequests)
      .where(eq(approvalRequests.deviceId, deviceId))
      .orderBy(desc(approvalRequests.createdAt)).limit(1);
    if (latest?.status === "cancelled" && latest.decidedAt && now - latest.decidedAt < 60_000) {
      return Response.json({ state: "cooldown", retryAfter: Math.ceil((60_000 - (now - latest.decidedAt)) / 1000) }, { status: 429 });
    }

    const requestId = newId("req");
    const approvalToken = randomToken(28);
    const pollToken = randomToken(28);
    const expiresAt = now + QR_TTL_MS;
    const userAgent = (value.userAgent ?? request.headers.get("user-agent") ?? "").slice(0, 512);
    await db.update(approvalRequests).set({ status: "expired", decidedAt: now })
      .where(and(eq(approvalRequests.deviceId, deviceId), eq(approvalRequests.status, "pending")));
    await db.insert(webDevices).values({
      id: deviceId,
      secretHash,
      status: "pending",
      userAgent,
      firstSeenAt: now,
      lastSeenAt: now,
    }).onConflictDoUpdate({ target: webDevices.id, set: { userAgent, lastSeenAt: now } });
    await db.insert(approvalRequests).values({
      id: requestId,
      deviceId,
      approvalTokenHash: await sha256(approvalToken),
      pollTokenHash: await sha256(pollToken),
      createdAt: now,
      expiresAt,
    });
    const qr = `queue-metro://enroll?v=1&r=${encodeURIComponent(requestId)}&t=${encodeURIComponent(approvalToken)}&e=${expiresAt}`;
    return Response.json({ state: "pending", requestId, pollToken, qr, expiresAt }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法建立授權申請", 500);
  }
}
