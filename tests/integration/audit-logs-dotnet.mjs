import assert from "node:assert/strict";

const base = new URL(process.env.DOTNET_TEST_URL ?? "http://localhost:5000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Development loopback URL required.");
assert.equal(base.protocol, "http:");
assert.equal(base.username, "");
assert.equal(base.password, "");
async function request(method, path, cookie) {
  const headers = { origin: base.origin };
  if (cookie) headers.cookie = `mh02_session=${cookie}`;
  const response = await fetch(new URL(path, base), { method, headers, redirect: "manual" });
  return { status: response.status, json: await response.json().catch(() => null), headers: response.headers };
}
for (const path of ["/api/audit-logs", "/api/audit-logs/1"]) {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((await request(method, path)).status, 401, `${method} ${path} must require authentication.`);
  }
}
console.log("PASS: audit reads and rejected writes require authentication.");
if (process.env.AUDIT_LOG_TEST_READ !== "development") {
  console.log("SKIP: authenticated checks require AUDIT_LOG_TEST_READ=development and MH02_TEST_SESSION.");
  process.exit(0);
}
const cookie = process.env.MH02_TEST_SESSION;
assert.ok(cookie && /^[A-Za-z0-9_=-]+$/.test(cookie), "A valid MH02_TEST_SESSION is required; never commit this token.");
const me = await request("GET", "/api/auth/me", cookie);
assert.equal(me.status, 200);
const first = await request("GET", "/api/audit-logs?pageSize=100", cookie);
assert.equal(first.status, 200);
assert.equal(first.json.timeZone, "UTC");
if (me.json.role === "user") for (const entry of first.json.items) assert.equal(entry.siteId, me.json.siteId);
for (const entry of first.json.items) {
  assert.match(entry.auditId, /^[1-9]\d*$/);
  assert.equal(entry.oldValues, null, "List must not expose before/after payloads.");
  assert.equal(entry.newValues, null);
  assert.ok(["INSERT", "UPDATE", "DELETE"].includes(entry.operation));
}
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  const blocked = await request(method, "/api/audit-logs", cookie);
  assert.equal(blocked.status, 405);
  assert.equal(blocked.json.error.code, "AUDIT_APPEND_ONLY");
  assert.equal(blocked.headers.get("allow"), "GET");
}
const chosen = first.json.items[0];
if (chosen) {
  const detail = await request("GET", `/api/audit-logs/${chosen.auditId}`, cookie);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.auditId, chosen.auditId);
  assert.equal(detail.json.recordId, chosen.recordId);
  function noSecrets(value) {
    if (Array.isArray(value)) { value.forEach(noSecrets); return; }
    if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, /pass(word)?|hash|secret|token|credential|connectionstring|activationcode|totp|apikey/i);
      noSecrets(child);
    }
  }
  noSecrets(detail.json.oldValues); noSecrets(detail.json.newValues);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const blocked = await request(method, `/api/audit-logs/${chosen.auditId}`, cookie);
    assert.equal(blocked.status, 405);
    assert.equal(blocked.json.error.code, "AUDIT_APPEND_ONLY");
  }
  assert.deepEqual((await request("GET", `/api/audit-logs/${chosen.auditId}`, cookie)).json, detail.json, "Rejected writes must leave the audit row unchanged.");
  const group = await request("GET", `/api/audit-logs?changeGroupId=${chosen.changeGroupId}`, cookie);
  assert.equal(group.status, 200);
  assert.ok(group.json.items.every((entry) => entry.changeGroupId === chosen.changeGroupId));
} else console.log("SKIP detail checks: no visible audit data; no fake row was inserted.");
assert.equal((await request("GET", "/api/audit-logs?dateFrom=invalid", cookie)).status, 400);
assert.equal((await request("GET", "/api/audit-logs?dateFrom=2026-11-20&dateTo=2026-11-19", cookie)).status, 400);
if (me.json.role === "user") {
  const reference = await request("GET", "/api/reference", cookie);
  const invalidSite = me.json.siteId === 1 ? 2 : 1;
  assert.equal((await request("GET", `/api/audit-logs?siteId=${invalidSite}`, cookie)).status, 403);
  assert.equal(reference.status, 200);
}
console.log("PASS: audit reads, UTC filters, detail redaction, change groups and immutable writes; no audit data created or modified.");