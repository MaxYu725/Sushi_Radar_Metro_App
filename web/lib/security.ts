const encoder = new TextEncoder();

export const QR_TTL_MS = 5 * 60_000;
export const ADMIN_CHALLENGE_TTL_MS = 60_000;
export const WEB_SESSION_TTL_MS = 24 * 60 * 60_000;

export function randomToken(bytes = 24): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64Url(data);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const output = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function canonicalAdminMessage(
  method: string,
  pathname: string,
  challengeId: string,
  timestamp: string,
  bodyText: string,
): Promise<string> {
  return ["QM1", method.toUpperCase(), pathname, challengeId, timestamp, await sha256(bodyText)].join("\n");
}

export async function verifyEcdsaSignature(
  publicKeySpki: string,
  signatureDer: string,
  message: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      fromBase64(publicKeySpki).buffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const signature = derEcdsaToP1363(fromBase64(signatureDer), 32);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature.buffer,
      encoder.encode(message),
    );
  } catch {
    return false;
  }
}

export function derEcdsaToP1363(signature: Uint8Array<ArrayBuffer>, size: number): Uint8Array<ArrayBuffer> {
  if (signature.length === size * 2) return signature;
  if (signature[0] !== 0x30) throw new Error("Invalid ECDSA signature");
  let offset = 1;
  const sequenceLength = readDerLength(signature, offset);
  offset = sequenceLength.offset;
  if (offset + sequenceLength.length !== signature.length) throw new Error("Invalid DER length");
  if (signature[offset++] !== 0x02) throw new Error("Missing r");
  const rLength = readDerLength(signature, offset);
  offset = rLength.offset;
  const r = signature.slice(offset, offset + rLength.length);
  offset += rLength.length;
  if (signature[offset++] !== 0x02) throw new Error("Missing s");
  const sLength = readDerLength(signature, offset);
  offset = sLength.offset;
  const s = signature.slice(offset, offset + sLength.length);
  const output = new Uint8Array(size * 2);
  copyInteger(r, output, 0, size);
  copyInteger(s, output, size, size);
  return output;
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; offset: number } {
  const first = bytes[offset++];
  if (first < 0x80) return { length: first, offset };
  const count = first & 0x7f;
  if (count < 1 || count > 2) throw new Error("Unsupported DER length");
  let length = 0;
  for (let index = 0; index < count; index += 1) length = (length << 8) | bytes[offset++];
  return { length, offset };
}

function copyInteger(value: Uint8Array, output: Uint8Array, outputOffset: number, size: number) {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start += 1;
  const normalized = value.slice(start);
  if (normalized.length > size) throw new Error("ECDSA integer is too large");
  output.set(normalized, outputOffset + size - normalized.length);
}

export function jsonError(message: string, status: number, code = "request_failed"): Response {
  return Response.json({ error: message, code }, { status });
}

export async function readJson<T>(request: Request, maxBytes = 16_384): Promise<{ value: T; raw: string }> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) throw new Error("Request is too large");
  return { value: JSON.parse(raw) as T, raw };
}

export function parseCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
