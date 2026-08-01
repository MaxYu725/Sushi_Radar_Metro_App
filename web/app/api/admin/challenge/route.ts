import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { adminChallenges, admins } from "@/db/schema";
import { ADMIN_CHALLENGE_TTL_MS, jsonError, newId, randomToken, readJson } from "@/lib/security";
import { enforceAdminChallengeRateLimit } from "@/lib/auth";

type Payload = { adminId?: string };

export async function POST(request: Request) {
  try {
    const limited = await enforceAdminChallengeRateLimit(request);
    if (limited) return limited;
    const { value } = await readJson<Payload>(request);
    const adminId = value.adminId?.trim() || null;
    const db = getDb();
    if (adminId) {
      const [admin] = await db.select({ id: admins.id }).from(admins)
        .where(and(eq(admins.id, adminId), isNull(admins.revokedAt))).limit(1);
      if (!admin) return jsonError("管理員不存在或已停用", 403, "admin_not_active");
    } else {
      const [total] = await db.select({ value: count() }).from(admins);
      if ((total?.value ?? 0) > 0) return jsonError("系統已完成擁有者初始化", 409, "owner_exists");
    }
    const now = Date.now();
    const id = newId("chl");
    await db.insert(adminChallenges).values({
      id,
      adminId,
      nonce: randomToken(20),
      createdAt: now,
      expiresAt: now + ADMIN_CHALLENGE_TTL_MS,
    });
    return Response.json({ challengeId: id, expiresAt: now + ADMIN_CHALLENGE_TTL_MS });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法建立管理員挑戰", 500);
  }
}
