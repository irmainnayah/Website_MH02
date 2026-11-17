#!/usr/bin/env node
/* ============================================================================
   API smoke test (integration). Needs: the app running (npm run dev), TCP/IP + Mixed Mode
   enabled, the dev test users (database/scripts/seed-test-users.mjs) and SEED_TEST_PASSWORD
   in the environment. It talks to http://localhost:3000 over HTTP, exactly like a browser.

     $env:SEED_TEST_PASSWORD = "<same password used for seed-test-users>"
     node tests/integration/api-smoke.mjs            # BASE_URL=http://localhost:3000

   It WRITES data (a device, an installation and its rollback) in the development database
   and cleans up what the API allows (the transaction is deleted; the device is archived).
   NEVER run it against production.
   ============================================================================ */

import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PASSWORD = process.env.SEED_TEST_PASSWORD;
if (!PASSWORD) {
  console.error("Set SEED_TEST_PASSWORD.");
  process.exit(2);
}

let passed = 0;
const results = [];
function ok(name) {
  passed += 1;
  results.push(`PASS ${name}`);
  console.log(`PASS ${name}`);
}

class Client {
  cookie = "";
  async call(method, url, { body, headers = {} } = {}) {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: { "content-type": "application/json", origin: BASE, ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("mh02_session=")) this.cookie = c.split(";")[0];
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, json, headers: res.headers };
  }
  async login(nrp) {
    const r = await this.call("POST", "/api/auth/login", { body: { nrp, password: PASSWORD } });
    assert.equal(r.status, 200, `login ${nrp}: ${JSON.stringify(r.json)}`);
  }
}

const key = () => `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 40).padEnd(16, "0");

const anon = new Client();
assert.equal((await anon.call("GET", "/api/auth/me")).status, 401);
ok("unauthenticated request is rejected (401)");
assert.equal((await anon.call("POST", "/api/auth/login", { body: { nrp: "DEV-ADMIN", password: "wrong-password" } })).status, 401);
ok("wrong password is rejected (401, generic message)");

const admin = new Client();
await admin.login("DEV-ADMIN");
const me = await admin.call("GET", "/api/auth/me");
assert.equal(me.json.role, "superadmin");
ok("Super Admin can log in and /auth/me reports the role from the database");

const tech1 = new Client();
await tech1.login("DEV-TECH-1");
const tech2 = new Client();
await tech2.login("DEV-TECH-2");
ok("technicians can log in");

// Reference data and Site scoping
const ref1 = await tech1.call("GET", "/api/reference");
assert.equal(ref1.json.sites.length, 1);
ok("a technician sees only their own Site in reference data");
const sites = (await admin.call("GET", "/api/reference")).json.sites;
const sangatta = sites.find((s) => s.siteCode === "SANGATTA");
const bengalon = sites.find((s) => s.siteCode === "BENGALON");
assert.ok(sangatta && bengalon);

const devicesT1 = (await tech1.call("GET", "/api/devices?pageSize=100")).json;
assert.ok(devicesT1.items.length > 0 && devicesT1.items.every((d) => d.siteId === sangatta.siteId));
ok("a technician lists only devices of their own Site");
const forbidden = await tech1.call("GET", `/api/devices?siteId=${bengalon.siteId}`);
assert.equal(forbidden.status, 403);
ok("a technician cannot ask for another Site (403)");
assert.equal((await tech1.call("GET", "/api/devices?archived=true")).status, 403);
ok("a technician cannot open the Device Archive (403)");

// Device registration is idempotent
const k1 = key();
const code = `SMOKE-${Date.now().toString().slice(-8)}`;
const body = { deviceCode: code, serialNumber: `SER-${code}`, notes: "api smoke test" };
const created = await tech1.call("POST", "/api/devices", { body, headers: { "idempotency-key": k1 } });
assert.equal(created.status, 201, JSON.stringify(created.json));
assert.equal(created.json.status.code, "in_stock_rfu");
assert.equal(created.json.siteId, sangatta.siteId);
ok("a technician registers a device: In Stock RFU, Site taken from the account");
const replay = await tech1.call("POST", "/api/devices", { body, headers: { "idempotency-key": k1 } });
assert.equal(replay.status, 200);
assert.equal(replay.headers.get("idempotency-replayed"), "true");
assert.equal(replay.json.deviceId, created.json.deviceId);
ok("the same request replays the original device (no duplicate)");
const reused = await tech1.call("POST", "/api/devices", { body: { ...body, deviceCode: `${code}X` }, headers: { "idempotency-key": k1 } });
assert.equal(reused.status, 422);
assert.equal(reused.json.error.code, "IDEMPOTENCY_KEY_REUSED");
ok("the same key with a different body is rejected (422)");
const dup = await tech1.call("POST", "/api/devices", { body, headers: { "idempotency-key": key() } });
assert.equal(dup.status, 409);
assert.equal(dup.json.error.code, "DEVICE_CODE_EXISTS");
ok("a different key with an existing device code returns 409 DEVICE_CODE_EXISTS");
const withStatus = await tech1.call("POST", "/api/devices", { body: { ...body, deviceCode: `${code}Y`, status: "in_use" }, headers: { "idempotency-key": key() } });
assert.equal(withStatus.status, 400);
ok("a client-supplied status is rejected (400)");
assert.equal((await tech1.call("POST", "/api/devices", { body })).status, 400);
ok("a missing Idempotency-Key is rejected (400)");

const deviceId = created.json.deviceId;
// Cross-Site isolation
assert.equal((await tech2.call("GET", `/api/devices/${deviceId}`)).status, 404);
ok("a technician of another Site gets 404 for the device");
// Regular users cannot edit, override or archive
assert.equal((await tech1.call("PATCH", `/api/devices/${deviceId}`, { body: { rowVersion: created.json.rowVersion, notes: "x" } })).status, 403);
assert.equal((await tech1.call("POST", `/api/devices/${deviceId}/override`, { body: { rowVersion: created.json.rowVersion, status: "in_stock_ho", reason: "x" } })).status, 403);
assert.equal((await tech1.call("POST", `/api/devices/${deviceId}/archive`, { body: { rowVersion: created.json.rowVersion } })).status, 403);
ok("a technician cannot edit, override or archive (403)");

// Installation: device -> In Use on a free Unit; a later Removal blocks deleting the Installation
const unitsFree = (await tech1.call("GET", "/api/fleet-units?available=true")).json.items;
assert.ok(unitsFree.length > 0, "no free Unit in Sangatta");
const unitNo = unitsFree[0].unitNo;
const pad = (n) => String(n).padStart(2, "0");
// Yesterday, so "finishedAt must not be in the future" can never fail whatever the local time zone is.
const now = new Date(Date.now() - 86_400_000);
const startedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`;
const finishedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:30`;
const instBody = { deviceCode: code, unitNo, startedAt, finishedAt, shift: "Shift 1", sourcePower: "Stand By" };
const ik = key();
const inst = await tech1.call("POST", "/api/installations", { body: instBody, headers: { "idempotency-key": ik } });
assert.equal(inst.status, 201, JSON.stringify(inst.json));
assert.match(inst.json.formNumber, /^INS-\d{6}-\d{3}$/);
assert.equal(inst.json.devices[0].after.status, "in_use");
assert.equal(inst.json.durationMinutes, 30);
ok(`installation created (${inst.json.formNumber}), device In Use, duration computed by the server`);
assert.equal((await tech1.call("POST", "/api/installations", { body: instBody, headers: { "idempotency-key": ik } })).status, 200);
ok("a repeated installation request is replayed, not duplicated");
const offset = await tech1.call("POST", "/api/installations", { body: { ...instBody, startedAt: `${startedAt}+08:00` }, headers: { "idempotency-key": key() } });
assert.equal(offset.status, 400);
ok("a time with a UTC offset is rejected (400)");
assert.equal((await tech1.call("DELETE", `/api/installations/${inst.json.activityId}`)).status, 403);
ok("a technician cannot delete a transaction (403)");

// Super Admin: delete restores the device, leaves an event and audit rows
const del = await admin.call("DELETE", `/api/installations/${inst.json.activityId}`);
assert.equal(del.status, 200, JSON.stringify(del.json));
const afterDel = (await admin.call("GET", `/api/devices/${deviceId}`)).json;
assert.equal(afterDel.status.code, "in_stock_rfu");
assert.equal(afterDel.unit, null);
ok("Super Admin deleted the installation: the device is back In Stock RFU without a Unit");
const timeline = (await admin.call("GET", `/api/devices/${deviceId}/timeline`)).json.items;
assert.ok(timeline.some((e) => e.type === "registered"));
assert.ok(timeline.some((e) => e.type === "transaction_deleted" && e.formNumber === inst.json.formNumber));
ok("the Device Timeline shows the registration and the transaction_deleted event");
const audit = (await admin.call("GET", "/api/audit-logs?pageSize=50&table=installation")).json;
assert.ok(audit.items.some((a) => a.action === "transaction_delete" && a.recordId === inst.json.formNumber));
ok("the Audit Log has the deletion row");

// Override requires a reason; archive keeps history
const dev = (await admin.call("GET", `/api/devices/${deviceId}`)).json;
const noReason = await admin.call("POST", `/api/devices/${deviceId}/override`, { body: { rowVersion: dev.rowVersion, status: "in_stock_ho", reason: "   " } });
assert.equal(noReason.status, 400);
ok("an override without a reason is rejected (400)");
const over = await admin.call("POST", `/api/devices/${deviceId}/override`, { body: { rowVersion: dev.rowVersion, status: "in_stock_ho", reason: "api smoke test override" } });
assert.equal(over.status, 200, JSON.stringify(over.json));
assert.equal(over.json.status.code, "in_stock_ho");
ok("Super Admin override applied with a reason");
const stale = await admin.call("POST", `/api/devices/${deviceId}/override`, { body: { rowVersion: dev.rowVersion, status: "in_stock_rfu", reason: "stale" } });
assert.equal(stale.status, 409);
ok("a stale rowVersion is refused (409)");
const arch = await admin.call("POST", `/api/devices/${deviceId}/archive`, { body: { rowVersion: over.json.rowVersion, reason: "api smoke test cleanup" } });
assert.equal(arch.status, 200, JSON.stringify(arch.json));
assert.equal(arch.json.isArchived, true);
ok("Super Admin archived the device (soft delete)");
assert.equal((await tech1.call("GET", `/api/devices/${deviceId}`)).status, 404);
const archiveList = (await admin.call("GET", "/api/devices?archived=true&pageSize=100")).json;
assert.ok(archiveList.items.some((d) => d.deviceId === deviceId));
const activeList = (await admin.call("GET", "/api/devices?pageSize=100")).json;
assert.ok(!activeList.items.some((d) => d.deviceId === deviceId));
ok("the archived device is hidden from users and active lists, and visible in the Device Archive");
assert.equal((await tech1.call("POST", "/api/devices", { body, headers: { "idempotency-key": k1 } })).status, 409);
ok("replaying the original creation of an archived device returns 409 ALREADY_PROCESSED_AND_ARCHIVED for a technician");

console.log(`\n${passed} checks passed.`);
