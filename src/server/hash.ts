// Hashing helpers (session tokens, idempotency request hashes). Node built-ins only.

import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Cryptographically random URL-safe token (256 bits). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** JSON with object keys sorted recursively, so equal payloads always hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value === undefined ? null : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** SHA-256 of the canonical form of the validated request (design 3.19 request_hash). */
export function requestHash(endpoint: string, resolvedSiteId: number | null, payload: unknown): string {
  return sha256Hex(canonicalJson({ endpoint, site: resolvedSiteId, payload }));
}
