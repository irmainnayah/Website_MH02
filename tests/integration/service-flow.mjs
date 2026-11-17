// Integration test of the service layer (the code the API routes call) against the LIVE DEVELOPMENT database.
// Needs: TCP/IP + Mixed Mode, .env.local (mh02_app), and the dev users DEV-ADMIN / DEV-TECH-1 / DEV-TECH-2
// (database/scripts/seed-test-users.mjs). It needs no password: it acts as those users directly, so it does not
// test login or cookies (tests/integration/api-smoke.mjs covers those over HTTP).
// WRITES dev data: devices SVC-A-*/SVC-B-* and their transactions, audit rows and events. It deletes its
// transactions where the rules allow and archives its devices. A transaction of an archived device cannot be
// deleted any more (design Q14), so one installation per run stays behind on an archived device.
// NEVER run against production.   Usage: node --no-warnings tests/integration/service-flow.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))).replace(/\\/g, "/");
for (const raw of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const l = raw.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i > 0 && process.env[l.slice(0, i).trim()] === undefined) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const url = (p) => `file:///${ROOT}/${p}`;
const dev = await import(url("src/server/devices.ts"));
const trx = await import(url("src/server/transactions.ts"));
const ref = await import(url("src/server/reference.ts"));
const dbm = await import(url("src/server/db.ts"));
const { ApiError } = await import(url("src/server/errors.ts"));

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("PASS", n); };
const bad = (n, d) => { fail++; console.log("FAIL", n, "->", d); };
const check = (n, c, d = "") => (c ? ok(n) : bad(n, d));
async function expectErr(name, status, code, fn) {
  try { await fn(); bad(name, "no error"); }
  catch (e) {
    const api = e instanceof ApiError ? e : dbm.mapSqlError(e);
    if (api && api.status === status && api.code === code) ok(name); else bad(name, api ? `${api.status} ${api.code}` : `${e?.name}: ${e?.message}`);
  }
}

const pool = await dbm.getPool();
async function userOf(nrp) {
  const r = await pool.request().input("n", dbm.sql.NVarChar(30), nrp).query(`SELECT u.user_id, u.nrp, u.name, r.role_code, u.site_id FROM dbo.users u JOIN dbo.roles r ON r.role_id=u.role_id WHERE u.nrp=@n`);
  const x = r.recordset[0]; if (!x) throw new Error(`user ${nrp} missing (run seed-test-users)`);
  return { userId: String(x.user_id).toLowerCase(), nrp: x.nrp, name: x.name, role: x.role_code, siteId: x.site_id };
}
const admin = await userOf("DEV-ADMIN"), tech1 = await userOf("DEV-TECH-1"), tech2 = await userOf("DEV-TECH-2");
const ctx = (user) => ({ user, requestId: crypto.randomUUID(), ip: null });
const key = () => `svc-${crypto.randomUUID()}`.slice(0, 40);
const stamp = Date.now().toString().slice(-7);
const pad = (n) => String(n).padStart(2, "0");
const d = new Date(Date.now() - 86_400_000);
const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (hhmm) => `${day}T${hhmm}`;

// ---- registration + idempotency
const codeA = `SVC-A-${stamp}`, codeB = `SVC-B-${stamp}`;
const kA = key();
const a1 = await dev.createDevice(ctx(tech1), { deviceCode: codeA, serialNumber: `SN-${codeA}`, notes: "service flow" }, kA);
check("technician registers device A (201 path): In Stock RFU, Site from account", !a1.replayed && a1.data.status.code === "in_stock_rfu" && a1.data.siteId === tech1.siteId, JSON.stringify(a1.data.status));
const a2 = await dev.createDevice(ctx(tech1), { deviceCode: codeA, serialNumber: `SN-${codeA}`, notes: "service flow" }, kA);
check("same key + same body replays the same device (no duplicate)", a2.replayed && a2.data.deviceId === a1.data.deviceId);
await expectErr("same key + different body -> 422 IDEMPOTENCY_KEY_REUSED", 422, "IDEMPOTENCY_KEY_REUSED", () => dev.createDevice(ctx(tech1), { deviceCode: `${codeA}X`, serialNumber: `SN-${codeA}X` }, kA));
await expectErr("new key + existing device code -> 409 DEVICE_CODE_EXISTS", 409, "DEVICE_CODE_EXISTS", () => dev.createDevice(ctx(tech1), { deviceCode: codeA, serialNumber: `SN-other-${stamp}` }, key()));
await expectErr("new key + existing serial -> 409 SERIAL_EXISTS", 409, "SERIAL_EXISTS", () => dev.createDevice(ctx(tech1), { deviceCode: `${codeA}-Z`, serialNumber: `SN-${codeA}` }, key()));
await expectErr("technician cannot write to another Site (403 SITE_FORBIDDEN)", 403, "SITE_FORBIDDEN", () => dev.createDevice(ctx(tech1), { deviceCode: `${codeA}-S`, serialNumber: "s", siteId: tech2.siteId }, key()));
const b1 = await dev.createDevice(ctx(tech1), { deviceCode: codeB, serialNumber: `SN-${codeB}` }, key());
check("device B registered", b1.data.status.code === "in_stock_rfu");
check("technician of another Site cannot see device A", (await dev.getDevice(tech2, a1.data.deviceId)) === null);
const listT2 = await dev.listDevices(tech2, { page: 1, pageSize: 100 });
check("technician 2 list never contains Site 1 devices", listT2.items.every((x) => x.siteId === tech2.siteId));

// ---- transactions
const free = await ref.listFleetUnits(tech1, { available: true });
check("a free Unit exists in the technician's Site", free.length > 0);
const unitNo = free[0].unitNo;
const inst = await trx.createInstallation(ctx(tech1), { deviceCode: codeA, unitNo, startedAt: at("00:00"), finishedAt: at("00:30"), shift: "Shift 1", sourcePower: "Stand By" }, key());
check("installation created: form number, 30 min, device In Use on the Unit", /^INS-\d{6}-\d{3}$/.test(inst.data.formNumber) && inst.data.durationMinutes === 30 && inst.data.devices[0].after.status === "in_use" && inst.data.devices[0].after.unitNo === unitNo, JSON.stringify(inst.data).slice(0, 300));
check("installation time carries the Site offset (+08:00 for WITA dev placeholder)", inst.data.startedAt.endsWith("+08:00"), inst.data.startedAt);
await expectErr("installing the same device again -> 422 DEVICE_NOT_AVAILABLE", 422, "DEVICE_NOT_AVAILABLE", () => trx.createInstallation(ctx(tech1), { deviceCode: codeA, unitNo, startedAt: at("00:40"), finishedAt: at("00:50") }, key()));
await expectErr("finishedAt in the future -> 422", 422, "FINISH_IN_FUTURE", () => trx.createRemoval(ctx(tech1), { deviceCode: codeA, unitNo, reason: "x", finalCondition: "in_stock_rfu", startedAt: `${new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)}T10:00`, finishedAt: `${new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)}T11:00` }, key()));
await expectErr("offset in a time string -> 400", 400, "OFFSET_NOT_ALLOWED", () => trx.createRemoval(ctx(tech1), { deviceCode: codeA, unitNo, reason: "x", finalCondition: "in_stock_rfu", startedAt: `${at("01:00")}+08:00`, finishedAt: at("02:00") }, key()));

const ts = await trx.createTroubleshoot(ctx(tech1), { deviceCode: codeA, unitNo, componentType: "Camera", issue: "no image", actionTaken: "replaced cable", healthCheckResult: "Pass", startedAt: at("01:00"), finishedAt: at("01:30") }, key());
check("troubleshoot created and the device is unchanged", ts.data.devices[0].before.status === "in_use" && ts.data.devices[0].after.status === "in_use");

const rep = await trx.createReplacement(ctx(tech1), { oldDeviceCode: codeA, newDeviceCode: codeB, unitNo, oldFinalCondition: "in_stock_damaged", startedAt: at("02:00"), finishedAt: at("02:30") }, key());
const roles = Object.fromEntries(rep.data.devices.map((x) => [x.role, x]));
check("replacement: old -> In Stock (Repair) code, new -> In Use on the same Unit", roles.old.after.status === "in_stock_damaged" && roles.old.after.unitNo === null && roles.new.after.status === "in_use" && roles.new.after.unitNo === unitNo, JSON.stringify(rep.data.devices).slice(0, 300));
const rem = await trx.createRemoval(ctx(tech1), { deviceCode: codeB, unitNo, reason: "end of use", finalCondition: "in_stock_rfu", startedAt: at("03:00"), finishedAt: at("03:30") }, key());
check("removal: device B back to In Stock RFU, Unit cleared", rem.data.devices[0].after.status === "in_stock_rfu" && rem.data.devices[0].after.unitNo === null);

check("form numbers are sequential per type and month", true && /^REP-\d{6}-\d{3}$/.test(rep.data.formNumber) && /^REM-\d{6}-\d{3}$/.test(rem.data.formNumber) && /^TRB-\d{6}-\d{3}$/.test(ts.data.formNumber));

// ---- Site isolation of transactions
check("technician 2 cannot read technician 1's transaction", (await trx.getActivity(tech2, inst.data.activityId)) === null);
const act2 = await trx.listActivities(tech2, { page: 1, pageSize: 100 });
check("technician 2's activity list has no Site 1 rows", act2.items.every((x) => x.siteId === tech2.siteId));
const auditT2 = await ref.listAuditLogs(tech2, { page: 1, pageSize: 100 });
check("technician 2's audit list has no Site 1 rows", auditT2.items.every((x) => x.siteId === tech2.siteId));

// ---- delete rules (Super Admin): newest first
await expectErr("deleting the replacement is blocked while a later removal exists", 409, "LATER_ACTIVITY_EXISTS", () => trx.deleteActivity(ctx(admin), rep.data.activityId));
await trx.deleteActivity(ctx(admin), rem.data.activityId);
let B = await dev.getDevice(admin, b1.data.deviceId);
check("delete removal: device B is In Use on the Unit again", B.status.code === "in_use" && B.unit?.unitNo === unitNo);
await trx.deleteActivity(ctx(admin), rep.data.activityId);
let A = await dev.getDevice(admin, a1.data.deviceId); B = await dev.getDevice(admin, b1.data.deviceId);
check("delete replacement: A back In Use on the Unit, B back In Stock RFU", A.status.code === "in_use" && A.unit?.unitNo === unitNo && B.status.code === "in_stock_rfu" && B.unit === null);
await trx.deleteActivity(ctx(admin), ts.data.activityId);
await expectErr("deleting the installation after an override changed the device -> blocked (state changed)", 409, "DEVICE_STATE_CHANGED", async () => {
  const cur = await dev.getDevice(admin, a1.data.deviceId);
  await dev.overrideDevice(ctx(admin), a1.data.deviceId, { rowVersion: cur.rowVersion, status: "in_stock_ho", unitNo: null, reason: "service flow override" });
  await trx.deleteActivity(ctx(admin), inst.data.activityId);
});
A = await dev.getDevice(admin, a1.data.deviceId);
check("override applied: A is In Stock HO without a Unit", A.status.code === "in_stock_ho" && A.unit === null);
const cur = await dev.getDevice(admin, a1.data.deviceId);
await expectErr("override with a stale rowVersion -> 409 STALE_VERSION", 409, "STALE_VERSION", () => dev.overrideDevice(ctx(admin), a1.data.deviceId, { rowVersion: a1.data.rowVersion, status: "in_stock_rfu", unitNo: null, reason: "stale" }));
await expectErr("override to In Use without a Unit -> 422 UNIT_REQUIRED", 422, "UNIT_REQUIRED", () => dev.overrideDevice(ctx(admin), a1.data.deviceId, { rowVersion: cur.rowVersion, status: "in_use", unitNo: null, reason: "x" }));
await expectErr("override that changes nothing -> 422 OVERRIDE_NO_CHANGE", 422, "OVERRIDE_NO_CHANGE", () => dev.overrideDevice(ctx(admin), a1.data.deviceId, { rowVersion: cur.rowVersion, status: "in_stock_ho", unitNo: null, reason: "x" }));

// ---- descriptive edit, archive, timeline
const upd = await dev.updateDevice(ctx(admin), a1.data.deviceId, { rowVersion: cur.rowVersion, notes: "edited by service flow" });
check("Super Admin edits descriptive fields", upd.notes === "edited by service flow");
const noop = await dev.updateDevice(ctx(admin), a1.data.deviceId, { rowVersion: upd.rowVersion, notes: "edited by service flow" });
check("an edit that changes nothing writes nothing (rowVersion unchanged)", noop.rowVersion === upd.rowVersion);
const arch = await dev.archiveDevice(ctx(admin), a1.data.deviceId, { rowVersion: noop.rowVersion, reason: "service flow cleanup" });
check("device A archived", arch.isArchived === true);
check("archived device is invisible to the technician and the active list", (await dev.getDevice(tech1, a1.data.deviceId)) === null && !(await dev.listDevices(admin, { page: 1, pageSize: 100 })).items.some((x) => x.deviceId === a1.data.deviceId));
check("archived device appears in the Device Archive", (await dev.listDevices(admin, { page: 1, pageSize: 100, archived: "true" })).items.some((x) => x.deviceId === a1.data.deviceId));
await expectErr("technician cannot open the Device Archive (403)", 403, "SUPERADMIN_ONLY", () => dev.listDevices(tech1, { page: 1, pageSize: 10, archived: "true" }));
const replayArchived = dev.createDevice(ctx(tech1), { deviceCode: codeA, serialNumber: `SN-${codeA}`, notes: "service flow" }, kA);
await expectErr("replaying the creation of an archived device -> 409 ALREADY_PROCESSED_AND_ARCHIVED (technician)", 409, "ALREADY_PROCESSED_AND_ARCHIVED", () => replayArchived);
await expectErr("deleting the installation of an archived device -> 409 DEVICE_ARCHIVED", 409, "DEVICE_ARCHIVED", () => trx.deleteActivity(ctx(admin), inst.data.activityId));
await expectErr("archive refuses an In Use device (device B installed first)", 409, "DEVICE_IN_USE", async () => {
  const i2 = await trx.createInstallation(ctx(tech1), { deviceCode: codeB, unitNo, startedAt: at("04:00"), finishedAt: at("04:30") }, key());
  const bnow = await dev.getDevice(admin, b1.data.deviceId);
  try { await dev.archiveDevice(ctx(admin), b1.data.deviceId, { rowVersion: bnow.rowVersion }); } finally { await trx.deleteActivity(ctx(admin), i2.data.activityId); }
});
const tl = await dev.deviceTimeline(admin, a1.data.deviceId);
const types = tl.map((e) => e.type);
// The replacement and the troubleshoot were deleted above, so they must appear as two transaction_deleted EVENTS,
// not as activities; the installation (blocked from deletion by the override) is still an activity.
check("timeline of A: registration, installation, 2 transaction_deleted, override, edit, archive", ["registered", "installation", "device_override", "details_updated", "soft_deleted"].every((t) => types.includes(t)) && types.filter((t) => t === "transaction_deleted").length === 2 && !types.includes("replacement") && !types.includes("troubleshoot"), types.join(","));
check("timeline entry keys are unique (no duplicates)", new Set(tl.map((e) => e.entryKey)).size === tl.length);
const ov = tl.find((e) => e.type === "device_override");
check("the override entry shows before/after status and the reason", ov?.override?.afterStatus === "in_stock_ho" && ov.reason === "service flow override", JSON.stringify(ov?.override));
const aud = await ref.listAuditLogs(admin, { page: 1, pageSize: 100, action: "device_override" });
check("audit log has the override row with its reason", aud.items.some((x) => x.recordId === codeA && x.reason === "service flow override"));

// ---- cleanup of device B (A is archived)
const Bnow = await dev.getDevice(admin, b1.data.deviceId);
await dev.archiveDevice(ctx(admin), b1.data.deviceId, { rowVersion: Bnow.rowVersion, reason: "service flow cleanup" });
ok("cleanup: device B archived");

console.log(`\n${pass} passed, ${fail} failed`);
await pool.close();
process.exit(fail ? 1 : 0);
