import { authorizedDevice } from "@/lib/auth";

export async function GET(request: Request) {
  const device = await authorizedDevice(request);
  return Response.json({ authorized: Boolean(device), deviceId: device?.deviceId ?? null }, {
    headers: { "cache-control": "no-store" },
  });
}
