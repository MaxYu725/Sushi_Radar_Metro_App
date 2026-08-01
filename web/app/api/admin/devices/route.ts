import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { webDevices } from "@/db/schema";
import { authorizeAdmin } from "@/lib/auth";
import { jsonError } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const admin = await authorizeAdmin(request, "");
    if (admin instanceof Response) return admin;
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 80);
    const oldest = url.searchParams.get("sort") === "oldest";
    const db = getDb();
    const statusCondition = status && ["pending", "allowed", "blocked", "revoked"].includes(status)
      ? eq(webDevices.status, status as "pending" | "allowed" | "blocked" | "revoked")
      : undefined;
    const searchCondition = search ? or(like(webDevices.note, `%${search}%`), like(webDevices.id, `%${search}%`)) : undefined;
    const rows = await db.select().from(webDevices)
      .where(statusCondition && searchCondition ? and(statusCondition, searchCondition) : statusCondition ?? searchCondition)
      .orderBy(oldest ? asc(webDevices.lastSeenAt) : desc(webDevices.lastSeenAt)).limit(200);
    return Response.json({ devices: rows });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法讀取裝置列表", 500);
  }
}
