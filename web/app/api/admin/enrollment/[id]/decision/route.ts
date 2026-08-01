import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests, auditLogs, webDevices, webSessions } from "@/db/schema";
import { authorizeAdmin } from "@/lib/auth";
import { jsonError, newId, readJson } from "@/lib/security";

type Payload = { decision?: "allow" | "cancel" | "block"; note?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { value, raw } = await readJson<Payload>(request);
    const admin = await authorizeAdmin(request, raw);
    if (admin instanceof Response) return admin;
    if (!value.decision || !["allow", "cancel", "block"].includes(value.decision)) {
      return jsonError("無效的審批動作", 400, "decision_invalid");
    }
    const { id } = await context.params;
    const db = getDb();
    const [approval] = await db.select().from(approvalRequests)
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, "pending"))).limit(1);
    if (!approval || approval.expiresAt <= Date.now()) return jsonError("申請已過期或已處理", 409, "request_not_pending");
    const note = (value.note ?? "").trim().slice(0, 300);
    const now = Date.now();
    const requestStatus = value.decision === "cancel" ? "cancelled" : value.decision === "allow" ? "allowed" : "blocked";
    const deviceStatus = value.decision === "cancel" ? "pending" : value.decision === "allow" ? "allowed" : "blocked";
    const changes = [
      db.update(approvalRequests).set({ status: requestStatus, note, decidedAt: now, decidedBy: admin.id })
        .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, "pending"))),
      db.update(webDevices).set({
        status: deviceStatus,
        note,
        authorizedAt: value.decision === "allow" ? now : null,
        authorizedBy: value.decision === "allow" ? admin.id : null,
        blockedAt: value.decision === "block" ? now : null,
        lastSeenAt: now,
      }).where(eq(webDevices.id, approval.deviceId)),
      db.insert(auditLogs).values({ id: newId("log"), adminId: admin.id, deviceId: approval.deviceId, action: `request_${value.decision}`, detail: note, createdAt: now }),
    ] as const;
    await db.batch(changes);
    if (value.decision === "block") await db.delete(webSessions).where(eq(webSessions.deviceId, approval.deviceId));
    return Response.json({ requestId: id, deviceId: approval.deviceId, state: requestStatus });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法處理授權申請", 500);
  }
}
