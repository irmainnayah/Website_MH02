#!/usr/bin/env node
/* ============================================================================
   Phase 5 HTTP integration test: photos (multipart), transaction PATCH, users, dashboard, RBAC.
   Needs the app RUNNING (npm run dev, or npm run build && npm start) against the DEVELOPMENT database and
   .env.local. Unlike api-smoke.mjs it needs NO password: it creates login sessions for DEV-ADMIN / DEV-TECH-1 /
   DEV-TECH-2 directly in the database (the same call the login route makes) and sends the cookie over HTTP.

     node --no-warnings tests/integration/phase5-http.mjs      # BASE_URL=http://localhost:3000

   WRITES dev data (a device, a transaction with photos, a test user TST-HTTP-*); it deletes the transaction,
   archives the device and deactivates the user. NEVER run against production.
   ============================================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))).replace(/\\/g, "/");
for (const raw of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const l = raw.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i > 0 && process.env[l.slice(0, i).trim()] === undefined) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const BASE = process.env.BASE_URL || "http://localhost:3000";
const dbm = await import(`file:///${ROOT}/src/server/db.ts`);
const ses = await import(`file:///${ROOT}/src/server/auth/session.ts`);
const pool = await dbm.getPool();

let passed = 0;
const ok = (n) => { passed++; console.log("PASS", n); };

async function sessionFor(nrp) {
  const [u] = (await pool.request().input("n", dbm.sql.NVarChar(30), nrp).query(`SELECT user_id FROM dbo.users WHERE nrp=@n`)).recordset;
  assert.ok(u, `user ${nrp} missing (run seed-test-users)`);
  const s = await ses.createSession(String(u.user_id).toLowerCase(), null, "phase5-http");
  return `mh02_session=${s.token}`;
}
class Client {
  constructor(cookie) { this.cookie = cookie; }
  async call(method, url, { json, form, headers = {}, origin = BASE } = {}) {
    const h = { ...(origin ? { origin } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers };
    let body;
    if (json !== undefined) { body = JSON.stringify(json); h["content-type"] = "application/json"; }
    if (form) body = form; // fetch sets the multipart boundary itself
    const res = await fetch(`${BASE}${url}`, { method, headers: h, body, redirect: "manual" });
    const buf = Buffer.from(await res.arrayBuffer());
    let parsed;
    try { parsed = JSON.parse(buf.toString("utf8")); } catch { parsed = undefined; }
    return { status: res.status, json: parsed, headers: res.headers, bytes: buf };
  }
}
const anon = new Client(""), admin = new Client(await sessionFor("DEV-ADMIN")), t1 = new Client(await sessionFor("DEV-TECH-1")), t2 = new Client(await sessionFor("DEV-TECH-2"));
const key = () => `h5-${crypto.randomUUID()}`.slice(0, 40);
const stamp = Date.now().toString().slice(-7);
const pad = (n) => String(n).padStart(2, "0");
const d0 = new Date(Date.now() - 86_400_000);
const day = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.getRandomValues(new Uint8Array(200))]);
const eq = (a, b, m) => assert.deepEqual(a, b, m);

/* ------------------------------------------------------------------ auth/RBAC */
eq((await anon.call("GET", "/api/dashboard/summary")).status, 401); ok("dashboard needs a session (401)");
eq((await anon.call("GET", "/api/users")).status, 401); ok("users need a session (401)");
eq((await anon.call("GET", "/api/photos/11111111-2222-3333-4444-555555555555")).status, 401); ok("photos need a session (401)");
const forbidden = await t1.call("GET", "/api/users");
eq(forbidden.status, 403); eq(forbidden.json.error.code, "SUPERADMIN_ONLY"); ok("a technician cannot list users (403)");
eq((await t1.call("POST", "/api/users", { json: { nrp: "XX-1234", name: "x", role: "superadmin", password: "Long-Enough-1" } })).status, 403); ok("a technician cannot create users (403)");

/* ----------------------------------------------------------- multipart + photos */
const dev = await t1.call("POST", "/api/devices", { json: { deviceCode: `H5-${stamp}`, serialNumber: `SN-H5-${stamp}` }, headers: { "idempotency-key": key() } });
eq(dev.status, 201); ok("JSON creation still works (device, 201)");
const units = await t1.call("GET", "/api/fleet-units?available=true");
const unitNo = (units.json.items ?? units.json)[0].unitNo;

const payload = JSON.stringify({ deviceCode: `H5-${stamp}`, unitNo, startedAt: `${day}T00:00`, finishedAt: `${day}T00:45`, shift: "Shift 1" });
const mk = (extra = {}, pl = payload) => {
  const f = new FormData();
  f.append("payload", pl);
  for (const [k, v] of Object.entries(extra)) f.append(k, v instanceof Uint8Array ? new Blob([v]) : v, v instanceof Uint8Array ? "foto.png" : undefined);
  return f;
};
const mkForm = (parts, pl = payload) => {
  const f = new FormData();
  f.append("payload", pl);
  for (const [k, v] of parts) { if (v instanceof Uint8Array) f.append(k, new Blob([v]), "foto.png"); else f.append(k, v); }
  return f;
};
void mk;
const noKey = await t1.call("POST", "/api/installations", { form: mkForm([["photo:mh02_installed", png()]]) });
eq(noKey.status, 400); eq(noKey.json.error.code, "IDEMPOTENCY_KEY_REQUIRED"); ok("multipart creation also requires an Idempotency-Key (400)");
const badSlot = await t1.call("POST", "/api/installations", { form: mkForm([["photo:beforeRepair", png()]]), headers: { "idempotency-key": key() } });
eq(badSlot.status, 400); eq(badSlot.json.error.code, "PHOTO_SLOT_INVALID"); ok("a slot of another transaction type is refused (400)");
const notImg = await t1.call("POST", "/api/installations", { form: mkForm([["photo:gps_antenna", Buffer.from("<script>alert(1)</script>")]]), headers: { "idempotency-key": key() } });
eq(notImg.status, 400); eq(notImg.json.error.code, "PHOTO_TYPE_INVALID"); ok("a non-image upload named .png is refused (400)");
const noPayload = await t1.call("POST", "/api/installations", { form: (() => { const f = new FormData(); f.append("photo:gps_antenna", new Blob([png()]), "a.png"); return f; })(), headers: { "idempotency-key": key() } });
eq(noPayload.status, 400); eq(noPayload.json.error.code, "PAYLOAD_REQUIRED"); ok("a multipart body without payload is refused (400)");
const withStatus = await t1.call("POST", "/api/installations", { form: mkForm([], JSON.stringify({ ...JSON.parse(payload), status: "completed" })), headers: { "idempotency-key": key() } });
eq(withStatus.status, 400); ok("a client-sent status inside the multipart payload is refused (400)");
const tooBig = await t1.call("POST", "/api/installations", { form: mkForm([["photo:gps_antenna", Buffer.concat([png(), Buffer.alloc(11 * 1024 * 1024)])]]), headers: { "idempotency-key": key() } });
eq(tooBig.status, 400); eq(tooBig.json.error.code, "PHOTO_TOO_LARGE"); ok("a photo above 10 MB is refused (400)");

const k = key();
const pngBytes = png();
const created = await t1.call("POST", "/api/installations", { form: mkForm([["photo:mh02_installed", pngBytes], ["caption:mh02_installed", "tampak depan"], ["photo:gps_antenna", png()]]), headers: { "idempotency-key": k } });
eq(created.status, 201, JSON.stringify(created.json)); ok("multipart installation with 2 photos -> 201");
const act = created.json;
eq(act.photos.length, 2); assert.match(act.rowVersion, /^0x[0-9A-Fa-f]{16}$/); ok("the response lists the photos and the rowVersion for PATCH");
const photo = act.photos.find((p) => p.slotKey === "mh02_installed");
eq(photo.caption, "tampak depan"); ok("the caption is stored");
const again = await t1.call("POST", "/api/installations", { form: mkForm([["photo:mh02_installed", pngBytes], ["caption:mh02_installed", "tampak depan"], ["photo:gps_antenna", png()]]), headers: { "idempotency-key": k } });
eq(again.status, 422); eq(again.json.error.code, "IDEMPOTENCY_KEY_REUSED"); ok("the same key with a different second photo -> 422 IDEMPOTENCY_KEY_REUSED");

const got = await t1.call("GET", photo.url);
eq(got.status, 200); eq(got.headers.get("content-type"), "image/png"); eq(got.headers.get("x-content-type-options"), "nosniff");
assert.ok(got.bytes.equals(pngBytes)); ok("the owner downloads the exact bytes (image/png, nosniff)");
eq((await admin.call("GET", photo.url)).status, 200); ok("Super Admin can open the photo");
eq((await t2.call("GET", photo.url)).status, 404); ok("another Site gets 404");
eq((await t1.call("GET", "/api/photos/not-a-uuid")).status, 404); ok("a malformed photo id is 404");
const detail = await t1.call("GET", `/api/installations/${act.activityId}`);
eq(detail.status, 200); eq(detail.json.photos.length, 2); ok("the transaction detail lists its photos");

/* ------------------------------------------------------------------ PATCH */
const patchPath = `/api/installations/${act.activityId}`;
eq((await t1.call("PATCH", patchPath, { json: { rowVersion: act.rowVersion, area: "x" } })).status, 403); ok("a technician cannot edit a transaction (403)");
eq((await t1.call("DELETE", patchPath)).status, 403); ok("a technician cannot delete a transaction (403)");
const p1 = await admin.call("PATCH", patchPath, { json: { rowVersion: act.rowVersion, area: "Pit 7", remarks: "diedit via HTTP" } });
eq(p1.status, 200, JSON.stringify(p1.json)); eq(p1.json.details.area, "Pit 7"); assert.notEqual(p1.json.rowVersion, act.rowVersion); ok("Super Admin edits metadata (200) and the rowVersion changes");
eq(p1.json.photos.length, 2); ok("editing keeps the photos");
const stale = await admin.call("PATCH", patchPath, { json: { rowVersion: act.rowVersion, area: "y" } });
eq(stale.status, 409); eq(stale.json.error.code, "STALE_VERSION"); ok("a stale rowVersion -> 409");
for (const [name, extra] of [["status", { status: "completed" }], ["siteId", { siteId: 2 }], ["durationMinutes", { durationMinutes: 5 }], ["timeZone", { timeZone: "Asia/Jakarta" }], ["utcOffset", { utcOffset: 480 }]]) {
  const r = await admin.call("PATCH", patchPath, { json: { rowVersion: p1.json.rowVersion, ...extra } });
  eq(r.status, 400, `${name} must be rejected`);
}
ok("status, siteId, duration, time zone and offsets are rejected in a PATCH (400)");
const noRv = await admin.call("PATCH", patchPath, { json: { area: "z" } });
eq(noRv.status, 400); ok("a PATCH without rowVersion is refused (400)");
eq((await admin.call("PATCH", `/api/removals/${act.activityId}`, { json: { rowVersion: p1.json.rowVersion, reason: "x" } })).status, 404); ok("PATCH through the wrong type endpoint -> 404");
const t = await admin.call("PATCH", patchPath, { json: { rowVersion: p1.json.rowVersion, finishedAt: `${day}T01:30` } });
eq(t.status, 200); eq(t.json.durationMinutes, 90); eq(t.json.timeZone, act.timeZone); ok("editing finishedAt recomputes the duration and keeps the zone");
const future = await admin.call("PATCH", patchPath, { json: { rowVersion: t.json.rowVersion, finishedAt: `${new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)}T10:00` } });
eq(future.status, 422); eq(future.json.error.code, "FINISH_IN_FUTURE"); ok("a finish time in the future -> 422");

/* ---------------------------------------------------------------- CSRF */
const csrf = await admin.call("PATCH", patchPath, { json: { rowVersion: t.json.rowVersion, area: "z" }, origin: "http://evil.example" });
eq(csrf.status, 403); eq(csrf.json.error.code, "BAD_ORIGIN"); ok("a cross-origin write is refused (403 BAD_ORIGIN)");

/* ------------------------------------------------------------------ users */
const nrp = `TST-HTTP-${stamp}`;
const pw = `Pw-${crypto.randomUUID().slice(0, 14)}`;
const nu = await admin.call("POST", "/api/users", { json: { nrp, name: "Pengguna HTTP", role: "user", siteId: 1, password: pw } });
eq(nu.status, 201, JSON.stringify(nu.json)); assert.ok(!JSON.stringify(nu.json).match(/hash|password/i)); ok("Super Admin creates a user (201); the response has no secret");
eq((await admin.call("POST", "/api/users", { json: { nrp, name: "x", role: "user", siteId: 1, password: pw } })).status, 409); ok("duplicate NRP -> 409");
eq((await admin.call("POST", "/api/users", { json: { nrp: `${nrp}9`, name: "x", role: "user", password: pw } })).status, 422); ok("role user without Site -> 422");
eq((await admin.call("POST", "/api/users", { json: { nrp: `${nrp}8`, name: "x", role: "user", siteId: 1, password: "short" } })).status, 400); ok("a short password -> 400");
eq((await admin.call("POST", "/api/users", { json: { nrp: `${nrp}7`, name: "x", role: "user", siteId: 1, password: pw, status: "active" } })).status, 400); ok("unknown fields are refused (400)");
const lst = await admin.call("GET", `/api/users?q=${nrp}`);
eq(lst.status, 200); eq(lst.json.total, 1); assert.ok(!JSON.stringify(lst.json).match(/hash/i)); ok("user list is searchable and has no hash");
const login = await anon.call("POST", "/api/auth/login", { json: { nrp, password: pw } });
eq(login.status, 200); ok("the created user can log in over HTTP");
const userCookie = login.headers.getSetCookie().find((c) => c.startsWith("mh02_session=")).split(";")[0];
const asUser = new Client(userCookie);
eq((await asUser.call("GET", "/api/auth/me")).status, 200); ok("the new user's session works");
const patchU = await admin.call("PATCH", `/api/users/${nu.json.userId}`, { json: { name: "Nama Diubah" } });
eq(patchU.status, 200); eq(patchU.json.name, "Nama Diubah"); ok("Super Admin updates a user (200)");
eq((await admin.call("PATCH", `/api/users/${nu.json.userId}`, { json: { password: "Another-Pass-1" } })).status, 400); ok("a password cannot be set through PATCH (400)");
eq((await admin.call("PATCH", `/api/users/${nu.json.userId}`, { json: { nrp: "OTHER" } })).status, 400); ok("the NRP is immutable (400)");
const me = (await admin.call("GET", "/api/auth/me")).json;
const selfId = (await admin.call("GET", `/api/users?q=DEV-ADMIN`)).json.items.find((u) => u.nrp === "DEV-ADMIN").userId;
void me;
const selfRole = await admin.call("PATCH", `/api/users/${selfId}`, { json: { role: "user", siteId: 1 } });
eq(selfRole.status, 403); eq(selfRole.json.error.code, "SELF_CHANGE_FORBIDDEN"); ok("a Super Admin cannot change their own role (403)");
const reset = await admin.call("POST", `/api/users/${nu.json.userId}/password`, { json: { password: `${pw}-2` } });
eq(reset.status, 200); eq((await asUser.call("GET", "/api/auth/me")).status, 401); ok("a password reset revokes the user's session (401 afterwards)");
eq((await anon.call("POST", "/api/auth/login", { json: { nrp, password: pw } })).status, 401); ok("the old password is refused");
eq((await anon.call("POST", "/api/auth/login", { json: { nrp, password: `${pw}-2` } })).status, 200); ok("the new password works");
eq((await admin.call("PATCH", `/api/users/${nu.json.userId}`, { json: { status: "inactive" } })).status, 200);
eq((await anon.call("POST", "/api/auth/login", { json: { nrp, password: `${pw}-2` } })).status, 401); ok("a deactivated user cannot log in (401)");
eq((await admin.call("GET", "/api/users/not-a-uuid")).status, 404); ok("a malformed user id is 404");
const aud = await admin.call("GET", `/api/audit-logs?table=user_management&pageSize=100`);
eq(aud.status, 200); assert.ok(aud.json.items.some((a) => a.action === "user_password_reset")); assert.ok(!JSON.stringify(aud.json).match(/\$2[aby]\$/)); ok("user actions appear in the audit log, without secrets");

/* -------------------------------------------------------------- dashboard */
const dA = await admin.call("GET", "/api/dashboard/summary?months=6");
eq(dA.status, 200); eq(dA.json.scope.allSites, true); eq(dA.json.monthlyActivity.length, 6); ok("Super Admin dashboard (all Sites, 6 months)");
const dT = await t1.call("GET", "/api/dashboard/summary");
eq(dT.status, 200); eq(dT.json.scope.allSites, false); eq(dT.json.monthlyActivity.length, 12); ok("technician dashboard is limited to the own Site (default 12 months)");
const other = await t1.call("GET", `/api/dashboard/summary?siteId=${(await t2.call("GET", "/api/auth/me")).json.siteId}`);
eq(other.status, 403); ok("a technician asking for another Site's dashboard -> 403");
const dF = await admin.call("GET", `/api/dashboard/summary?siteId=${dT.json.scope.siteId}`);
eq(JSON.stringify(dF.json.statusDistribution), JSON.stringify(dT.json.statusDistribution)); ok("Super Admin filtered to a Site matches that Site's technician view");
eq((await admin.call("GET", "/api/dashboard/summary?months=99")).status, 400); ok("an out-of-range months parameter -> 400");

/* ---------------------------------------------------------------- delete + cleanup */
const del = await admin.call("DELETE", patchPath);
eq(del.status, 200); ok("Super Admin deletes the transaction (200)");
eq((await admin.call("GET", photo.url)).status, 404); ok("its photos are no longer served (rows gone, files quarantined)");
const dv = await admin.call("GET", `/api/devices/${dev.json.deviceId}`);
eq(dv.json.status.code, "in_stock_rfu"); ok("the device is back In Stock RFU after the delete");
const arch = await admin.call("POST", `/api/devices/${dev.json.deviceId}/archive`, { json: { rowVersion: dv.json.rowVersion, reason: "phase5 http cleanup" } });
eq(arch.status, 200); ok("cleanup: the test device is archived");

console.log(`\n${passed} passed, 0 failed`);
await pool.close();
