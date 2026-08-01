import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalAdminMessage,
  constantTimeEqual,
  derEcdsaToP1363,
  sha256,
  verifyEcdsaSignature,
} from "../lib/security.ts";

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

test("canonical admin message binds method, path, challenge, timestamp and exact body", async () => {
  const body = '{"decision":"allow","note":"family"}';
  const canonical = await canonicalAdminMessage("post", "/api/admin/enrollment/req/decision", "chl_1", "123", body);
  assert.equal(canonical, `QM1\nPOST\n/api/admin/enrollment/req/decision\nchl_1\n123\n${await sha256(body)}`);
  assert.notEqual(await sha256(body), await sha256(`${body} `));
});

test("canonical admin message also binds query filters", async () => {
  const first = await canonicalAdminMessage("GET", "/api/admin/devices?status=allowed", "chl_2", "456", "");
  const second = await canonicalAdminMessage("GET", "/api/admin/devices?status=blocked", "chl_2", "456", "");
  assert.notEqual(first, second);
});

test("constant-time comparison reports equal and unequal strings", () => {
  assert.equal(constantTimeEqual("same", "same"), true);
  assert.equal(constantTimeEqual("same", "different"), false);
  assert.equal(constantTimeEqual("short", "shorter"), false);
});

test("DER ECDSA signatures are normalized to 64-byte P1363", () => {
  const r = Uint8Array.from([0, 0x80, ...new Array(31).fill(1)]);
  const s = Uint8Array.from([0x7f, ...new Array(31).fill(2)]);
  const der = Uint8Array.from([0x30, 2 + r.length + 2 + s.length, 0x02, r.length, ...r, 0x02, s.length, ...s]);
  const normalized = derEcdsaToP1363(der, 32);
  assert.equal(normalized.length, 64);
  assert.equal(normalized[0], 0x80);
  assert.equal(normalized[32], 0x7f);
});

test("WebCrypto P-256 signatures verify through the server verifier", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const message = "signed queue metro request";
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(message));
  assert.equal(await verifyEcdsaSignature(toBase64Url(spki), toBase64Url(signature), message), true);
  assert.equal(await verifyEcdsaSignature(toBase64Url(spki), toBase64Url(signature), `${message}!`), false);
});
