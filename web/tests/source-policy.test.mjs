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
  assert.match(source, /glyphs: "https:\/\/tiles\.basemaps\.cartocdn\.com\/fonts/);
  assert.match(source, /map\.setStyle\(DEFAULT_STYLE\)/);
  assert.match(source, /map\.on\("style\.load"/);
  assert.match(source, /map\.on\("load", initializeRadar\)/);
  assert.match(source, /if \(!map\.getStyle\(\)\.glyphs\) return/);
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
  assert.match(source, /content-type[\s\S]*text\/html[\s\S]*accept[\s\S]*text\/html/);
  assert.match(source, /new HTMLRewriter\(\)/);
  assert.match(source, /viewport-fit=cover/);
  assert.match(source, /no-cache, max-age=0, must-revalidate/);
  assert.doesNotMatch(source, /await response\.text\(\)/);
});

test("web home tiles match the Android queue-number layout without top safe-area padding", async () => {
  const component = await readFile(new URL("../components/QueueMetroWeb.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /variant="home"/);
  assert.match(component, /現正叫號[\s\S]*輪候組數/);
  assert.match(component, /formatQueueTime\(queue\)/);
  assert.doesNotMatch(styles, /\.shell[^}]*padding-top:\s*env\(safe-area-inset-top\)/);
});
