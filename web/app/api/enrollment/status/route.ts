import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalRequests } from "@/db/schema";
import { jsonError, readJson, sha256 } from "@/lib/security";
import { secretsMatch } from "@/lib/auth";

type Payload = { requestId?: string; pollToken?: string };

export async function POST(request: Request) {
  try {
    const { value } = await readJson<Payload>(request);
    const requestId = value.requestId?.trim() ?? "";
    const pollToken = value.pollToken ?? "";
    const db = getDb();
    const [row] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).limit(1);
    if (!row || !secretsMatch(row.pollTokenHash, await sha256(pollToken))) {
      return jsonError("授權申請不存在", 404, "request_not_found");
    }
    if (row.status === "pending" && row.expiresAt <= Date.now()) {
      await db.update(approvalRequests).set({ status: "expired", decidedAt: Date.now() }).where(eq(approvalRequests.id, row.id));
      return Response.json({ state: "expired" });
    }
    return Response.json({ state: row.status, note: row.note, expiresAt: row.expiresAt });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法查詢授權狀態", 500);
  }
}
