import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("queue proxy uses the proven Hong Kong Sushiro endpoints and throttled cache", async () => {
  const source = await readFile(new URL("../lib/queue-source.ts", import.meta.url), "utf8");
  assert.match(source, /sushipass\.sushiro\.com\.hk\/api\/2\.0\/info\/storelist/);
  assert.match(source, /sushipass\.sushiro\.com\.hk\/api\/2\.0\/remote\/groupqueues/);
  assert.match(source, /cacheTtl:\s*ttlSeconds/);
  assert.doesNotMatch(source, /demo|mock|fixture/i);
});

test("queue routes reject unauthorised web sessions before contacting upstream", async () => {
  const [stores, status] = await Promise.all([
    readFile(new URL("../app/api/queue/stores/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/queue/status/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(stores, /authorizedDevice\(request\)[\s\S]*fetchStores\(\)/);
  assert.match(status, /authorizedDevice\(request\)[\s\S]*map\(fetchQueue\)/);
});

test("D1 migration includes all authorization records and useful indexes", async () => {
  const migration = await readFile(new URL("../drizzle/0000_queue_metro_auth.sql", import.meta.url), "utf8");
  for (const table of ["admins", "web_devices", "approval_requests", "admin_challenges", "web_sessions", "audit_logs", "rate_limits"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(migration, /approval_requests_token_idx/);
  assert.match(migration, /web_sessions_token_idx/);
});

test("nearby map can initialise without downloading a remote style document", async () => {
  const source = await readFile(new URL("../components/NearbyMap.tsx", import.meta.url), "utf8");
  assert.match(source, /const DEFAULT_STYLE:[\s\S]*type: "raster"/);
  assert.match(source, /map\.setStyle\(DEFAULT_STYLE\)/);
  assert.match(source, /map\.on\("style\.load"/);
});

test("PWA manifest provides fullscreen display and install icons", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Sushi Radar");
  assert.equal(manifest.display, "fullscreen");
  assert.ok(manifest.display_override.includes("standalone"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});

test("Worker preserves streaming while adding PWA viewport safe-area support", async () => {
  const source = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(source, /content-type[\s\S]*text\/html/);
  assert.match(source, /new HTMLRewriter\(\)/);
  assert.match(source, /viewport-fit=cover/);
  assert.doesNotMatch(source, /await response\.text\(\)/);
});
