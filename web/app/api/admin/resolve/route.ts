import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests, webDevices } from "@/db/schema";
import { authorizeAdmin } from "@/lib/auth";
import { jsonError, readJson, sha256 } from "@/lib/security";

type Payload = { approvalToken?: string };

export async function POST(request: Request) {
  try {
    const { value, raw } = await readJson<Payload>(request);
    const admin = await authorizeAdmin(request, raw);
    if (admin instanceof Response) return admin;
    const tokenHash = await sha256(value.approvalToken ?? "");
    const db = getDb();
    const [row] = await db.select({
      requestId: approvalRequests.id,
      deviceId: webDevices.id,
      createdAt: approvalRequests.createdAt,
      expiresAt: approvalRequests.expiresAt,
      userAgent: webDevices.userAgent,
      status: webDevices.status,
      note: webDevices.note,
      tokenHash: approvalRequests.approvalTokenHash,
    }).from(approvalRequests)
      .innerJoin(webDevices, eq(approvalRequests.deviceId, webDevices.id))
      .where(and(
        eq(approvalRequests.status, "pending"),
        eq(approvalRequests.approvalTokenHash, tokenHash),
        gt(approvalRequests.expiresAt, Date.now()),
      )).limit(1);
    if (!row) return jsonError("QR 已過期、已處理或格式不正確", 404, "approval_token_invalid");
    return Response.json({
      requestId: row.requestId,
      deviceId: row.deviceId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      userAgent: row.userAgent,
      deviceStatus: row.status,
      note: row.note,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法解析 QR", 500);
  }
}
