import { and, count, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { adminChallenges, admins, auditLogs } from "@/db/schema";
import { runtimeEnv } from "@/lib/runtime";
import { canonicalAdminMessage, constantTimeEqual, jsonError, newId, readJson, sha256, verifyEcdsaSignature } from "@/lib/security";

type Payload = {
  adminId?: string;
  displayName?: string;
  publicKey?: string;
  bootstrapCode?: string;
};

export async function POST(request: Request) {
  try {
    const { value, raw } = await readJson<Payload>(request);
    const adminId = value.adminId?.trim() ?? "";
    const publicKey = value.publicKey?.trim() ?? "";
    const challengeId = request.headers.get("x-admin-challenge")?.trim() ?? "";
    const timestamp = request.headers.get("x-admin-timestamp")?.trim() ?? "";
    const signature = request.headers.get("x-admin-signature")?.trim() ?? "";
    if (!/^adm_[A-Za-z0-9_-]{16,100}$/u.test(adminId) || !publicKey || !challengeId || !signature) {
      return jsonError("擁有者初始化資料不完整", 400, "bootstrap_invalid");
    }
    if (Math.abs(Date.now() - Number(timestamp)) > 120_000) return jsonError("初始化請求已過期", 401, "bootstrap_expired");
    const configuredCode = runtimeEnv().OWNER_BOOTSTRAP_CODE ?? "";
    if (configuredCode.length < 12 || !constantTimeEqual(await sha256(configuredCode), await sha256(value.bootstrapCode ?? ""))) {
      return jsonError("初始化密碼不正確或尚未設定", 403, "bootstrap_code_invalid");
    }
    const db = getDb();
    const [total] = await db.select({ value: count() }).from(admins);
    if ((total?.value ?? 0) > 0) return jsonError("擁有者已存在", 409, "owner_exists");
    const [challenge] = await db.select().from(adminChallenges).where(and(
      eq(adminChallenges.id, challengeId),
      isNull(adminChallenges.adminId),
      isNull(adminChallenges.usedAt),
      gt(adminChallenges.expiresAt, Date.now()),
    )).limit(1);
    if (!challenge) return jsonError("初始化挑戰無效", 401, "bootstrap_challenge_invalid");
    const canonical = await canonicalAdminMessage("POST", new URL(request.url).pathname, challengeId, timestamp, raw);
    if (!await verifyEcdsaSignature(publicKey, signature, canonical)) {
      return jsonError("裝置金鑰簽名無效", 401, "bootstrap_signature_invalid");
    }
    const now = Date.now();
    await db.batch([
      db.insert(admins).values({ id: adminId, displayName: (value.displayName ?? "Owner").slice(0, 80), publicKeySpki: publicKey, role: "owner", createdAt: now }),
      db.update(adminChallenges).set({ usedAt: now }).where(and(eq(adminChallenges.id, challengeId), isNull(adminChallenges.usedAt))),
      db.insert(auditLogs).values({ id: newId("log"), adminId, action: "owner_bootstrap", createdAt: now }),
    ]);
    return Response.json({ adminId, role: "owner" }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法初始化擁有者", 500);
  }
}
