import { desc, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { authorizeAdmin } from "@/lib/auth";
import { jsonError } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const admin = await authorizeAdmin(request, "");
    if (admin instanceof Response) return admin;
    const search = (new URL(request.url).searchParams.get("search") ?? "").trim().slice(0, 80);
    const rows = await getDb().select().from(auditLogs)
      .where(search ? or(like(auditLogs.detail, `%${search}%`), like(auditLogs.deviceId, `%${search}%`)) : undefined)
      .orderBy(desc(auditLogs.createdAt)).limit(200);
    return Response.json({ audit: rows });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法讀取操作記錄", 500);
  }
}
