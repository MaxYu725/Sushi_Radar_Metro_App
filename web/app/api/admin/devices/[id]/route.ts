import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests, auditLogs, webDevices, webSessions } from "@/db/schema";
import { authorizeAdmin } from "@/lib/auth";
import { jsonError, newId, readJson } from "@/lib/security";

type Payload = { action?: "allow" | "block" | "revoke" | "unblock"; note?: string };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { value, raw } = await readJson<Payload>(request);
    const admin = await authorizeAdmin(request, raw);
    if (admin instanceof Response) return admin;
    if (!value.action || !["allow", "block", "revoke", "unblock"].includes(value.action)) {
      return jsonError("無效的裝置動作", 400, "device_action_invalid");
    }
    const { id } = await context.params;
    const db = getDb();
    const [device] = await db.select().from(webDevices).where(eq(webDevices.id, id)).limit(1);
    if (!device) return jsonError("找不到裝置", 404, "device_not_found");
    const note = (value.note ?? device.note).trim().slice(0, 300);
    const now = Date.now();
    const status = value.action === "allow" ? "allowed"
      : value.action === "block" ? "blocked"
        : value.action === "revoke" ? "revoked" : "pending";
    await db.batch([
      db.update(webDevices).set({
        status,
        note,
        authorizedAt: status === "allowed" ? now : null,
        authorizedBy: status === "allowed" ? admin.id : null,
        blockedAt: status === "blocked" ? now : null,
      }).where(eq(webDevices.id, id)),
      db.insert(auditLogs).values({ id: newId("log"), adminId: admin.id, deviceId: id, action: `device_${value.action}`, detail: note, createdAt: now }),
    ]);
    if (status !== "allowed") await db.delete(webSessions).where(eq(webSessions.deviceId, id));
    if (status === "blocked") {
      await db.update(approvalRequests).set({ status: "blocked", decidedAt: now, decidedBy: admin.id, note })
        .where(eq(approvalRequests.deviceId, id));
    }
    return Response.json({ deviceId: id, status, note });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法更新裝置", 500);
  }
}
