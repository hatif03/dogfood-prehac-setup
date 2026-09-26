/**
 * Same bytes as the API's signing.canonical(): json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False).
 * ponytail: numbers use JS formatting, so a float like 4.0 serializes as "4" (Python: "4.0"). Record payloads only carry
 * ints and strings today; prefer the record's own `canonical` field when it is present.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",")}}`;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim().toLowerCase();
  if (!/^([0-9a-f]{2})*$/.test(clean)) throw new Error("Signature is not hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export type Ed25519Jwk = { kty: string; crv: string; x: string };

/** true/false = verified in this browser; "unsupported" = no Ed25519 in WebCrypto here. */
export async function verifyInBrowser(canonical: string, signatureHex: string, jwk: Ed25519Jwk): Promise<boolean | "unsupported"> {
  if (!globalThis.crypto?.subtle) return "unsupported"; // plain http on a LAN address has no WebCrypto
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotSupportedError") return "unsupported";
    throw err;
  }
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = hexToBytes(signatureHex);
  } catch {
    return false;
  }
  return crypto.subtle.verify({ name: "Ed25519" }, key, sig, new TextEncoder().encode(canonical));
}
