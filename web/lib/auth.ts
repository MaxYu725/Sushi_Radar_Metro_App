import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adminChallenges, admins, rateLimits, webDevices, webSessions } from "@/db/schema";
import { canonicalAdminMessage, constantTimeEqual, jsonError, parseCookie, sha256, verifyEcdsaSignature } from "./security";
import { runtimeEnv } from "./runtime";

export const SESSION_COOKIE = "qm_session";

export type AdminIdentity = { id: string; displayName: string; role: "owner" | "admin" };

export async function authorizeAdmin(request: Request, rawBody: string): Promise<AdminIdentity | Response> {
  const adminId = request.headers.get("x-admin-id")?.trim() ?? "";
  const challengeId = request.headers.get("x-admin-challenge")?.trim() ?? "";
  const timestamp = request.headers.get("x-admin-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-admin-signature")?.trim() ?? "";
  const timestampNumber = Number(timestamp);
  if (!adminId || !challengeId || !signature || !Number.isFinite(timestampNumber)) {
    return jsonError("缺少管理員簽署資料", 401, "admin_signature_required");
  }
  if (Math.abs(Date.now() - timestampNumber) > 120_000) {
    return jsonError("管理員請求時間已失效", 401, "admin_timestamp_expired");
  }

  const db = getDb();
  const [admin] = await db.select().from(admins)
    .where(and(eq(admins.id, adminId), isNull(admins.revokedAt))).limit(1);
  const [challenge] = await db.select().from(adminChallenges)
    .where(and(
      eq(adminChallenges.id, challengeId),
      eq(adminChallenges.adminId, adminId),
      isNull(adminChallenges.usedAt),
      gt(adminChallenges.expiresAt, Date.now()),
    )).limit(1);
  if (!admin || !challenge) return jsonError("管理員或一次性挑戰無效", 401, "admin_challenge_invalid");

  const url = new URL(request.url);
  const canonical = await canonicalAdminMessage(request.method, `${url.pathname}${url.search}`, challengeId, timestamp, rawBody);
  const valid = await verifyEcdsaSignature(admin.publicKeySpki, signature, canonical);
  if (!valid) return jsonError("管理員簽名驗證失敗", 401, "admin_signature_invalid");

  const used = await db.update(adminChallenges).set({ usedAt: Date.now() })
    .where(and(eq(adminChallenges.id, challengeId), isNull(adminChallenges.usedAt)))
    .returning({ id: adminChallenges.id });
  if (used.length !== 1) return jsonError("一次性挑戰已被使用", 409, "admin_challenge_used");
  return { id: admin.id, displayName: admin.displayName, role: admin.role };
}

export async function authorizedDevice(request: Request) {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const db = getDb();
  const [row] = await db.select({
    sessionId: webSessions.id,
    deviceId: webSessions.deviceId,
    expiresAt: webSessions.expiresAt,
    status: webDevices.status,
  }).from(webSessions)
    .innerJoin(webDevices, eq(webSessions.deviceId, webDevices.id))
    .where(and(
      eq(webSessions.tokenHash, tokenHash),
      gt(webSessions.expiresAt, now),
      eq(webDevices.status, "allowed"),
    )).limit(1);
  if (!row) return null;
  await db.update(webSessions).set({ lastSeenAt: now }).where(eq(webSessions.id, row.sessionId));
  await db.update(webDevices).set({ lastSeenAt: now }).where(eq(webDevices.id, row.deviceId));
  return row;
}

export async function enforceEnrollmentRateLimit(request: Request): Promise<Response | null> {
  return enforceRateLimit(request, "enroll", 5, 10 * 60_000);
}

export async function enforceAdminChallengeRateLimit(request: Request): Promise<Response | null> {
  return enforceRateLimit(request, "admin-challenge", 120, 10 * 60_000);
}

async function enforceRateLimit(request: Request, bucket: string, maximum: number, windowMs: number): Promise<Response | null> {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const salt = runtimeEnv().RATE_LIMIT_SALT ?? "queue-metro-local-rate-limit";
  const key = `${bucket}:${await sha256(`${salt}:${address.trim()}`)}`;
  const db = getDb();
  const now = Date.now();
  const [existing] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  if (!existing || existing.expiresAt <= now) {
    await db.insert(rateLimits).values({ key, count: 1, windowStartedAt: now, expiresAt: now + windowMs })
      .onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, windowStartedAt: now, expiresAt: now + windowMs } });
    return null;
  }
  if (existing.count >= maximum) return jsonError("申請次數過多，請稍後再試", 429, "rate_limited");
  await db.update(rateLimits).set({ count: sql`${rateLimits.count} + 1` }).where(eq(rateLimits.key, key));
  return null;
}

export async function newestActiveAdminChallenge(adminId: string) {
  const db = getDb();
  return db.select().from(adminChallenges)
    .where(and(eq(adminChallenges.adminId, adminId), isNull(adminChallenges.usedAt)))
    .orderBy(desc(adminChallenges.createdAt)).limit(1);
}

export function secretsMatch(leftHash: string, candidateHash: string): boolean {
  return constantTimeEqual(leftHash, candidateHash);
}
