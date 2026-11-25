#!/usr/bin/env node
/* ============================================================================
   Device create / edit / archive against the running .NET backend (development database only).

     $env:MH02_TEST_SESSION      = "<mh02_session cookie value of a Super Admin>"
     $env:MH02_TEST_USER_SESSION = "<mh02_session cookie value of a regular user>"
     node tests/integration/device-writes-dotnet.mjs        # DOTNET_TEST_URL defaults to http://localhost:5000

   Never save or share the tokens. WRITES dev data: devices TSTDEV-*, their audit rows and events. It archives the devices
   it creates (there is no hard delete). NEVER run against production.
   ============================================================================ */
import assert from "node:assert/strict";

const BASE = process.env.DOTNET_TEST_URL || "http://localhost:5000";
const adminToken = process.env.MH02_TEST_SESSION, userToken = process.env.MH02_TEST_USER_SESSION;
if (!adminToken || !userToken) { console.error("Set MH02_TEST_SESSION (Super Admin) and MH02_TEST_USER_SESSION (regular user)."); process.exit(2); }

let passed = 0;
const ok = (name) => { passed++; console.log("PASS", name); };
async function call(token, method, url, { json, headers = {} } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method, redirect: "manual",
    headers: { origin: BASE, ...(token ? { cookie: `mh02_session=${token}` } : {}), ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
  return { status: res.status, body, headers: res.headers };
}
const key = () => `tstdev-${crypto.randomUUID()}`.slice(0, 40);
const stamp = Date.now().toString().slice(-7);
const code = (s) => `TSTDEV-${s}-${stamp}`;
const admin = (m, u, o) => call(adminToken, m, u, o), user = (m, u, o) => call(userToken, m, u, o);
const expect = (r, status, errorCode, name) => { assert.equal(r.status, status, `${name}: ${r.status} ${JSON.stringify(r.body)}`); if (errorCode) assert.equal(r.body?.error?.code, errorCode, name); ok(name); };

const me = (await user("GET", "/api/auth/me")).body, adminMe = (await admin("GET", "/api/auth/me")).body;
assert.equal(me.role, "user"); assert.equal(adminMe.role, "superadmin"); ok("sessions: one regular user, one Super Admin");
const created = [];

/* ---- register as a regular user ---- */
expect(await call(null, "POST", "/api/devices", { json: { deviceCode: code("A"), serialNumber: `SN-${code("A")}` }, headers: { "idempotency-key": key() } }), 401, "UNAUTHENTICATED", "no session -> 401");
expect(await user("POST", "/api/devices", { json: { deviceCode: code("A"), serialNumber: "x" } }), 400, "IDEMPOTENCY_KEY_REQUIRED", "registering needs an Idempotency-Key (400)");
const kA = key(), bodyA = { deviceCode: code("A"), serialNumber: `SN-${code("A")}`, notes: "dibuat teknisi" };
const a = await user("POST", "/api/devices", { json: bodyA, headers: { "idempotency-key": kA } });
expect(a, 201, null, "a regular user registers a device (201)");
assert.equal(a.body.status.code, "in_stock_rfu"); assert.equal(a.body.siteId, me.siteId); assert.equal(a.body.unit, null); assert.equal(a.body.isArchived, false);
created.push(a.body); ok("it starts In Stock RFU, in the user's own Site, without a Unit");
const replay = await user("POST", "/api/devices", { json: bodyA, headers: { "idempotency-key": kA } });
expect(replay, 200, null, "the same key and body replays (200)");
assert.equal(replay.headers.get("idempotency-replayed"), "true"); assert.equal(replay.body.deviceId, a.body.deviceId); ok("…with Idempotency-Replayed and the same device (no duplicate)");
expect(await user("POST", "/api/devices", { json: { ...bodyA, notes: "lain" }, headers: { "idempotency-key": kA } }), 422, "IDEMPOTENCY_KEY_REUSED", "the same key with another body -> 422");
expect(await user("POST", "/api/devices", { json: { deviceCode: code("A"), serialNumber: "SN-other" }, headers: { "idempotency-key": key() } }), 409, "DEVICE_CODE_EXISTS", "an existing code -> 409 DEVICE_CODE_EXISTS");
expect(await user("POST", "/api/devices", { json: { deviceCode: code("A2"), serialNumber: bodyA.serialNumber }, headers: { "idempotency-key": key() } }), 409, "SERIAL_EXISTS", "an existing serial -> 409 SERIAL_EXISTS");
expect(await user("POST", "/api/devices", { json: { deviceCode: "bad code!", serialNumber: "x" }, headers: { "idempotency-key": key() } }), 400, "VALIDATION_FAILED", "an invalid code -> 400");
expect(await user("POST", "/api/devices", { json: { deviceCode: code("S"), serialNumber: "x", status: "in_use" }, headers: { "idempotency-key": key() } }), 400, null, "a client-sent status is rejected (400)");
expect(await user("POST", "/api/devices", { json: { deviceCode: code("U"), serialNumber: "x", unitId: crypto.randomUUID() }, headers: { "idempotency-key": key() } }), 400, null, "a client-sent Unit is rejected (400)");
expect(await user("POST", "/api/devices", { json: { siteId: 999999, deviceCode: code("X"), serialNumber: "x" }, headers: { "idempotency-key": key() } }), 403, "SITE_FORBIDDEN", "a regular user cannot register into another Site (403)");
expect(await user("POST", "/api/devices", { json: { siteId: me.siteId, deviceCode: code("B"), serialNumber: `SN-${code("B")}` }, headers: { "idempotency-key": key() } }), 201, null, "naming the own Site explicitly is accepted").then?.(() => {});
const bUser = (await admin("GET", `/api/devices?q=${code("B")}`)).body.items[0]; created.push(bUser);

/* ---- a regular user can neither edit nor archive ---- */
expect(await user("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: a.body.rowVersion, notes: "x" } }), 403, "SUPERADMIN_ONLY", "a regular user cannot edit a device (403)");
expect(await user("POST", `/api/devices/${a.body.deviceId}/archive`, { json: { rowVersion: a.body.rowVersion } }), 403, "SUPERADMIN_ONLY", "a regular user cannot archive a device (403)");

/* ---- Super Admin ---- */
expect(await admin("POST", "/api/devices", { json: { deviceCode: code("C"), serialNumber: `SN-${code("C")}` }, headers: { "idempotency-key": key() } }), 400, "SITE_REQUIRED", "a Super Admin must choose the Site (400)");
const c = await admin("POST", "/api/devices", { json: { siteId: me.siteId, deviceCode: code("C"), serialNumber: `SN-${code("C")}` }, headers: { "idempotency-key": key() } });
expect(c, 201, null, "a Super Admin registers a device for a chosen Site (201)"); created.push(c.body);

expect(await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: "0x0000000000000001", notes: "x" } }), 409, "STALE_VERSION", "a stale rowVersion -> 409");
expect(await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { notes: "x" } }), 400, "VALIDATION_FAILED", "rowVersion is required (400)");
for (const extra of [{ status: "in_use" }, { siteId: 2 }, { unitId: crypto.randomUUID() }, { isArchived: true }]) {
  expect(await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: a.body.rowVersion, ...extra } }), 400, null, `PATCH rejects ${Object.keys(extra)[0]} (400)`);
}
const p1 = await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: a.body.rowVersion, serialNumber: `SN-${code("A")}-R`, notes: "diedit superadmin" } });
expect(p1, 200, null, "Super Admin edits serial and notes (200)");
assert.equal(p1.body.serialNumber, `SN-${code("A")}-R`); assert.equal(p1.body.notes, "diedit superadmin"); assert.notEqual(p1.body.rowVersion, a.body.rowVersion); ok("…and the rowVersion changes");
const p2 = await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: p1.body.rowVersion, serialNumber: `SN-${code("A")}-R`, notes: "diedit superadmin" } });
assert.equal(p2.status, 200); assert.equal(p2.body.rowVersion, p1.body.rowVersion); ok("an edit that changes nothing writes nothing (same rowVersion)");
const p3 = await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: p1.body.rowVersion, notes: "" } });
assert.equal(p3.status, 200); assert.equal(p3.body.notes, null); ok("an empty notes value clears the notes");
expect(await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: p3.body.rowVersion, deviceCode: c.body.deviceCode } }), 409, "DEVICE_CODE_EXISTS", "renaming onto an existing code -> 409");
const p4 = await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: p3.body.rowVersion, deviceCode: code("A-NEW") } });
expect(p4, 200, null, "Super Admin renames the device code (200)");
assert.equal((await admin("GET", `/api/timeline/${encodeURIComponent(code("A-NEW"))}`)).status, 200); ok("the timeline is reachable under the new code");

/* ---- archive ---- */
const units = (await admin("GET", `/api/fleet-units?available=true`)).body;
const unitNo = (units.items ?? units)[0]?.unitNo;
if (unitNo) {
  const d = (n) => { const x = new Date(Date.now() - 86_400_000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}T${n}`; };
  const inst = await admin("POST", "/api/installations", { json: { siteId: me.siteId, deviceCode: c.body.deviceCode, unitNo, startedAt: d("00:00"), finishedAt: d("00:30") }, headers: { "idempotency-key": key() } });
  assert.equal(inst.status, 201, JSON.stringify(inst.body));
  const cur = (await admin("GET", `/api/devices/${c.body.deviceId}`)).body;
  expect(await admin("POST", `/api/devices/${c.body.deviceId}/archive`, { json: { rowVersion: cur.rowVersion } }), 409, "DEVICE_IN_USE", "an In Use device cannot be archived (409)");
  assert.equal((await admin("DELETE", `/api/installations/${inst.body.activityId}`)).status, 200); ok("…the test installation was rolled back (device In Stock RFU again)");
}
for (const dev of created) {
  const cur = (await admin("GET", `/api/devices/${dev.deviceId}`)).body;
  expect(await admin("POST", `/api/devices/${dev.deviceId}/archive`, { json: { rowVersion: "0x0000000000000001" } }), 409, "STALE_VERSION", `archive with a stale rowVersion -> 409 (${cur.deviceCode})`);
  break;
}
const cur = (await admin("GET", `/api/devices/${a.body.deviceId}`)).body;
const arch = await admin("POST", `/api/devices/${a.body.deviceId}/archive`, { json: { rowVersion: cur.rowVersion, reason: "uji otomatis" } });
expect(arch, 200, null, "Super Admin archives a device (200)"); assert.equal(arch.body.isArchived, true); ok("…it is flagged archived and keeps its history");
expect(await admin("POST", `/api/devices/${a.body.deviceId}/archive`, { json: { rowVersion: arch.body.rowVersion } }), 409, "DEVICE_ALREADY_ARCHIVED", "archiving twice -> 409");
expect(await admin("PATCH", `/api/devices/${a.body.deviceId}`, { json: { rowVersion: arch.body.rowVersion, notes: "x" } }), 409, "DEVICE_ARCHIVED", "an archived device cannot be edited (409)");
expect(await user("GET", `/api/devices/${a.body.deviceId}`), 404, "NOT_FOUND", "a regular user no longer sees the archived device (404)");
const list = (await user("GET", `/api/devices?q=${code("A")}`)).body; assert.equal(list.items.length, 0); ok("…and it is gone from the user's active list");
const adminArchive = (await admin("GET", `/api/devices?archived=true&q=${code("A")}`)).body; assert.equal(adminArchive.items.length, 1); ok("the Super Admin finds it in the Device Archive");
const tl = (await admin("GET", `/api/timeline/${encodeURIComponent(code("A-NEW"))}?pageSize=100`)).body;
const types = tl.items.map((i) => i.type);
for (const t of ["registered", "details_updated", "soft_deleted"]) assert.ok(types.includes(t), `timeline has ${t}: ${types}`);
ok("the timeline shows registered, details_updated and soft_deleted events");
const audit = (await admin("GET", `/api/audit-logs?table=device&pageSize=100`)).body.items.filter((x) => String(x.recordId ?? x.record_id).startsWith("TSTDEV-"));
for (const action of ["device_register", "device_update", "device_archive"]) assert.ok(audit.some((x) => x.action === action), `audit has ${action}`);
ok("the audit log has device_register, device_update and device_archive rows");

for (const dev of created.slice(1)) {
  const cur2 = (await admin("GET", `/api/devices/${dev.deviceId}`)).body;
  if (!cur2.isArchived) await admin("POST", `/api/devices/${dev.deviceId}/archive`, { json: { rowVersion: cur2.rowVersion, reason: "uji otomatis (bersih-bersih)" } });
}
ok("cleanup: the test devices are archived");
console.log(`\n${passed} passed, 0 failed`);
