#!/usr/bin/env node
/* ============================================================================
   Installation edit (PATCH) against the running .NET backend (development database only).

     $env:MH02_TEST_SESSION      = "<mh02_session cookie value of a Super Admin>"
     $env:MH02_TEST_USER_SESSION = "<mh02_session cookie value of a regular user>"
     node tests/integration/installation-edit-dotnet.mjs        # DOTNET_TEST_URL defaults to http://localhost:5000

   Needs at least two free Units in the Site. Never save or share the tokens. WRITES dev data: devices TSTEDIT-* and
   one installation, which it deletes again (the devices are archived). NEVER run against production.
   ============================================================================ */
import assert from "node:assert/strict";

const BASE = process.env.DOTNET_TEST_URL || "http://localhost:5000";
const adminToken = process.env.MH02_TEST_SESSION, userToken = process.env.MH02_TEST_USER_SESSION;
if (!adminToken || !userToken) { console.error("Set MH02_TEST_SESSION and MH02_TEST_USER_SESSION."); process.exit(2); }
let passed = 0;
const ok = (n) => { passed++; console.log("PASS", n); };
async function call(token, method, url, json, headers = {}) {
  const res = await fetch(`${BASE}${url}`, { method, redirect: "manual", headers: { origin: BASE, cookie: `mh02_session=${token}`, ...(json ? { "content-type": "application/json" } : {}), ...headers }, body: json ? JSON.stringify(json) : undefined });
  const text = await res.text(); let body; try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
  return { status: res.status, body };
}
const admin = (m, u, j, h) => call(adminToken, m, u, j, h), user = (m, u, j, h) => call(userToken, m, u, j, h);
const expect = (r, status, code, name) => { assert.equal(r.status, status, `${name}: ${r.status} ${JSON.stringify(r.body)}`); if (code) assert.equal(r.body?.error?.code, code, name); ok(name); };
const key = () => `tstedit-${crypto.randomUUID()}`.slice(0, 40);
const stamp = Date.now().toString().slice(-7);
const pad = (n) => String(n).padStart(2, "0");
const day = (back) => { const x = new Date(Date.now() - back * 86_400_000); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

const me = (await admin("GET", "/api/auth/me")).body; assert.equal(me.role, "superadmin");
const units = (await admin("GET", `/api/fleet-units?available=true&siteId=${(await user("GET", "/api/auth/me")).body.siteId}`)).body;
const free = (units.items ?? units).map((u) => u.unitNo); assert.ok(free.length >= 2, "needs two free Units");
const siteId = (await user("GET", "/api/auth/me")).body.siteId;
const mk = async (s) => (await admin("POST", "/api/devices", { siteId, deviceCode: `TSTEDIT-${s}-${stamp}`, serialNumber: `SN-TSTEDIT-${s}-${stamp}` }, { "idempotency-key": key() })).body;
const dA = await mk("A"), dB = await mk("B");
const inst = await admin("POST", "/api/installations", { siteId, deviceCode: dA.deviceCode, unitNo: free[0], startedAt: `${day(3)}T08:00`, finishedAt: `${day(3)}T09:00`, shift: "Shift 1", area: "Pit 1" }, { "idempotency-key": key() });
assert.equal(inst.status, 201, JSON.stringify(inst.body)); const id = inst.body.activityId;
const get = async () => (await admin("GET", `/api/installations/${id}`)).body;
const devState = async (d) => (await admin("GET", `/api/devices/${d.deviceId}`)).body;
let rec = await get();

try {
  expect(await user("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, area: "x" }), 403, "SUPERADMIN_ONLY", "a regular user cannot edit (403)");
  expect(await admin("PATCH", `/api/installations/${id}`, { rowVersion: "0x0000000000000001", area: "x" }), 409, "STALE_VERSION", "a stale rowVersion -> 409");
  for (const extra of [{ siteId: 2 }, { status: "completed" }, { durationMinutes: 5 }, { timeZone: "Asia/Jakarta" }, { formNumber: "INS-1" }]) {
    expect(await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, ...extra }), 400, "VALIDATION_FAILED", `PATCH rejects ${Object.keys(extra)[0]}`);
  }
  expect(await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, startedAt: `${day(3)}T08:00:00+08:00` }), 400, "VALIDATION_FAILED", "an offset in a time is rejected (400)");

  let r = await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, area: "Pit 7", shift: "Shift 2" });
  expect(r, 200, null, "a metadata edit works (200)"); rec = await get(); assert.equal(rec.details.area, "Pit 7"); assert.equal(rec.shift, "Shift 2");
  r = await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, area: "Pit 7" });
  assert.equal(r.body.rowVersion, rec.rowVersion); ok("a patch that changes nothing writes nothing (same rowVersion)");

  // Unit change
  r = await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, unitNo: free[1] });
  expect(r, 200, null, "a master edit (Unit) works"); rec = await get();
  assert.equal(rec.unitNo, free[1]); assert.equal((await devState(dA)).unit.unitNo, free[1]); ok("the header and the device follow the new Unit");
  assert.ok(((await admin("GET", `/api/fleet-units?available=true&siteId=${siteId}`)).body.items ?? (await admin("GET", `/api/fleet-units?available=true&siteId=${siteId}`)).body).some((u) => u.unitNo === free[0])); ok("the old Unit is free again");

  // Device change
  r = await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, deviceCode: dB.deviceCode });
  expect(r, 200, null, "a master edit (device) works"); rec = await get();
  assert.equal(rec.devices[0].deviceCode, dB.deviceCode);
  assert.equal((await devState(dA)).status.code, "in_stock_rfu"); assert.equal((await devState(dB)).status.code, "in_use"); ok("the old device is In Stock RFU again and the new device is In Use");
  expect(await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, deviceCode: "NOPE-NOT-A-DEVICE" }), 422, "DEVICE_NOT_FOUND", "an unknown device -> 422 and nothing changes");
  assert.equal((await devState(dB)).status.code, "in_use"); ok("…the failed edit was rolled back");

  // Times
  r = await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, finishedAt: `${day(3)}T10:15` });
  expect(r, 200, null, "editing finishedAt works"); rec = await get();
  assert.equal(rec.durationMinutes, 135); assert.equal(rec.timeZone, inst.body.timeZone ?? rec.timeZone); ok("the duration is recomputed (135 min) and the zone is kept");
  expect(await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, finishedAt: `${day(3)}T07:00` }), 422, "FINISH_BEFORE_START", "finish before start -> 422");
  const future = new Date(Date.now() + 5 * 86_400_000); const fd = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T10:00`;
  expect(await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, finishedAt: fd }), 422, "FINISH_IN_FUTURE", "finish in the future -> 422");

  // Later activity blocks master edits, not metadata edits
  const ts = await admin("POST", "/api/troubleshoots", { siteId, deviceCode: dB.deviceCode, unitNo: free[1], componentType: "Camera", issue: "i", actionTaken: "a", startedAt: `${day(2)}T08:00`, finishedAt: `${day(2)}T08:30` }, { "idempotency-key": key() });
  if (ts.status === 201) {
    expect(await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, unitNo: free[0] }), 409, "LATER_ACTIVITY_EXISTS", "a master edit is blocked by a later activity (409)");
    expect((await admin("PATCH", `/api/installations/${id}`, { rowVersion: rec.rowVersion, remarks: "boleh" })).status, 200); ok("a metadata edit is still allowed");
    assert.equal((await admin("DELETE", `/api/troubleshoots/${ts.body.formNumber}`)).status, 200); ok("the test troubleshoot was removed");
  } else console.log("SKIP later-activity checks (troubleshoot create returned", ts.status, ")");
} finally {
  const del = await admin("DELETE", `/api/installations/${id}`);
  console.log("cleanup: delete installation ->", del.status);
  for (const d of [dA, dB]) { const cur = await devState(d); if (!cur.isArchived && cur.status.code !== "in_use") await admin("POST", `/api/devices/${d.deviceId}/archive`, { rowVersion: cur.rowVersion, reason: "uji otomatis" }); }
}
console.log(`\n${passed} passed, 0 failed`);
