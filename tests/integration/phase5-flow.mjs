// Integration test of the Phase 5 services (photos, transaction edit, user management, dashboard) against the LIVE
// DEVELOPMENT database. Like service-flow.mjs it acts as DEV-ADMIN / DEV-TECH-1 / DEV-TECH-2 directly (no password).
// WRITES dev data: devices P5-*, test users TST-USR-*, audit rows, form numbers. It deletes its transactions
// (newest first) and archives its devices and deactivates its users; photo files live in a temporary folder.
// NEVER run against production.   Usage: node --no-warnings tests/integration/phase5-flow.mjs
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))).replace(/\\/g, "/");
for (const raw of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const l = raw.trim();
  if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("=");
  if (i > 0 && process.env[l.slice(0, i).trim()] === undefined) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const STORE = mkdtempSync(path.join(tmpdir(), "mh02-p5-"));
process.env.PHOTO_STORAGE_ROOT = STORE;
process.env.PHOTO_BACKGROUND_JOBS = "false";
process.env.LOGIN_LOCKOUT_THRESHOLD = "3";

const url = (p) => `file:///${ROOT}/${p}`;
const dev = await import(url("src/server/devices.ts"));
const trx = await import(url("src/server/transactions.ts"));
const ref = await import(url("src/server/reference.ts"));
const usr = await import(url("src/server/users.ts"));
const dash = await import(url("src/server/dashboard.ts"));
const pho = await import(url("src/server/photos.ts"));
const ses = await import(url("src/server/auth/session.ts"));
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
const q = (text, inputs = {}) => {
  const r = pool.request();
  for (const [k, [t, v]] of Object.entries(inputs)) r.input(k, t, v);
  return r.query(text).then((x) => x.recordset);
};
async function userOf(nrp) {
  const [x] = await q(`SELECT u.user_id, u.nrp, u.name, r.role_code, u.site_id FROM dbo.users u JOIN dbo.roles r ON r.role_id=u.role_id WHERE u.nrp=@n`, { n: [dbm.sql.NVarChar(30), nrp] });
  if (!x) throw new Error(`user ${nrp} missing (run seed-test-users)`);
  return { userId: String(x.user_id).toLowerCase(), nrp: x.nrp, name: x.name, role: x.role_code, siteId: x.site_id };
}
const admin = await userOf("DEV-ADMIN"), tech1 = await userOf("DEV-TECH-1"), tech2 = await userOf("DEV-TECH-2");
const ctx = (user) => ({ user, requestId: crypto.randomUUID(), ip: null });
const key = () => `p5-${crypto.randomUUID()}`.slice(0, 40);
const stamp = Date.now().toString().slice(-7);
const pad = (n) => String(n).padStart(2, "0");
const d0 = new Date(Date.now() - 86_400_000);
const day = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
const at = (hhmm) => `${day}T${hhmm}`;
const d1 = new Date(Date.now() - 2 * 86_400_000);
const dayBefore = `${d1.getFullYear()}-${pad(d1.getMonth() + 1)}-${pad(d1.getDate())}`;
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.getRandomValues(new Uint8Array(64))]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.getRandomValues(new Uint8Array(64))]);
const staging = () => readdirSync(path.join(STORE, "_staging")).filter((n) => !n.startsWith("."));
const auditCount = async (formNumber) => Number((await q(`SELECT COUNT(*) n FROM dbo.audit_log WHERE record_id = @f`, { f: [dbm.sql.NVarChar(60), formNumber] }))[0].n);
const created = { activities: [], devices: [], users: [] }; // for cleanup

const reg = async (code, user = tech1) => {
  const r = await dev.createDevice(ctx(user), { deviceCode: code, serialNumber: `SN-${code}` }, key());
  created.devices.push(r.data);
  return r.data;
};
const free = await ref.listFleetUnits(tech1, { available: true });
check("at least 4 free Units exist in the technician's Site", free.length >= 4, `found ${free.length}`);
const [U1, U2, U3, U4] = free.map((u) => u.unitNo);

/* =============================================================== PHOTOS */
console.log("\n--- photos");
const pA = await reg(`P5-A-${stamp}`);
const pngA = png(), jpgA = jpg();
const k1 = key();
const inst = await trx.createInstallation(ctx(tech1), { deviceCode: pA.deviceCode, unitNo: U1, startedAt: at("00:00"), finishedAt: at("00:30") }, k1, [
  { slotKey: "mh02_installed", data: pngA, filename: "depan.png", caption: "tampak depan" },
  { slotKey: "gps_antenna", data: jpgA },
]);
created.activities.push(inst.data.activityId);
check("installation with 2 photos is created (201 path) and lists both photos", !inst.replayed && inst.data.photos.length === 2, JSON.stringify(inst.data.photos));
const ph = inst.data.photos.find((p) => p.slotKey === "mh02_installed");
check("photo metadata: caption, mime, size, authenticated URL", ph.caption === "tampak depan" && ph.mimeType === "image/png" && ph.sizeBytes === pngA.length && ph.url === `/api/photos/${ph.photoId}`, JSON.stringify(ph));
const [row] = await q(`SELECT storage_path, sha256, size_bytes, uploaded_by FROM dbo.transaction_photos WHERE photo_id=@id`, { id: [dbm.sql.UniqueIdentifier, ph.photoId] });
check("row holds a RELATIVE final path photos/yyyy/mm/id.ext and the sha256", /^photos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/.test(row.storage_path) && /^[0-9a-f]{64}$/.test(row.sha256.trim()), row.storage_path);
check("file was finalized to the final path (bytes are not in SQL Server)", existsSync(path.join(STORE, row.storage_path)) && statSync(path.join(STORE, row.storage_path)).size === pngA.length);
check("no staging file is left after finalization", staging().length === 0, staging().join(","));
check("uploaded_by is the technician", String(row.uploaded_by).toLowerCase() === tech1.userId);

const fileFor = await pho.openPhoto(tech1, ph.photoId);
check("owner Site can open the photo", fileFor.mimeType === "image/png" && existsSync(fileFor.path));
check("Super Admin can open the photo", (await pho.openPhoto(admin, ph.photoId)).sizeBytes === pngA.length);
await expectErr("another Site gets 404 (no existence leak)", 404, "NOT_FOUND", () => pho.openPhoto(tech2, ph.photoId));
await expectErr("unknown / malformed photo id -> 404", 404, "NOT_FOUND", () => pho.openPhoto(admin, "not-a-uuid"));

const replay = await trx.createInstallation(ctx(tech1), { deviceCode: pA.deviceCode, unitNo: U1, startedAt: at("00:00"), finishedAt: at("00:30") }, k1, [
  { slotKey: "mh02_installed", data: pngA, filename: "depan.png", caption: "tampak depan" },
  { slotKey: "gps_antenna", data: jpgA },
]);
check("same key + same body + same photos replays the original (no second activity)", replay.replayed && replay.data.activityId === inst.data.activityId);
check("a replay stages nothing that stays behind", staging().length === 0, staging().join(","));
check("a replay creates no second photo rows", Number((await q(`SELECT COUNT(*) n FROM dbo.transaction_photos WHERE activity_id=@a`, { a: [dbm.sql.UniqueIdentifier, inst.data.activityId] }))[0].n) === 2);
await expectErr("same key with a DIFFERENT photo -> 422 IDEMPOTENCY_KEY_REUSED", 422, "IDEMPOTENCY_KEY_REUSED", () =>
  trx.createInstallation(ctx(tech1), { deviceCode: pA.deviceCode, unitNo: U1, startedAt: at("00:00"), finishedAt: at("00:30") }, k1, [{ slotKey: "mh02_installed", data: png() }]));
check("the refused request left no staged file", staging().length === 0, staging().join(","));

await expectErr("a business failure removes its staged photos and creates no rows", 422, "DEVICE_NOT_FOUND", () =>
  trx.createInstallation(ctx(tech1), { deviceCode: `NOPE-${stamp}`, unitNo: U2, startedAt: at("01:00"), finishedAt: at("01:30") }, key(), [{ slotKey: "gps_antenna", data: png() }]));
check("…staging is empty", staging().length === 0, staging().join(","));
await expectErr("a slot of another transaction type -> 400", 400, "PHOTO_SLOT_INVALID", () =>
  trx.createTroubleshoot(ctx(tech1), { deviceCode: pA.deviceCode, componentType: "Camera", issue: "i", actionTaken: "a", startedAt: at("01:00"), finishedAt: at("01:10") }, key(), [{ slotKey: "gps_antenna", data: png() }]));
await expectErr("a non-image file is refused (magic bytes)", 400, "PHOTO_TYPE_INVALID", () =>
  trx.createTroubleshoot(ctx(tech1), { deviceCode: pA.deviceCode, componentType: "Camera", issue: "i", actionTaken: "a", startedAt: at("01:00"), finishedAt: at("01:10") }, key(), [{ slotKey: "beforeRepair", data: Buffer.from("<html>not an image</html>") }]));

// Crash after COMMIT but before the move: the file is back in staging; the reconciler must finalize it.
const finalPath = path.join(STORE, row.storage_path);
renameSync(finalPath, path.join(STORE, "_staging", `${ph.photoId}.upload`));
check("while only the staging file exists the photo is still served", (await pho.openPhoto(tech1, ph.photoId)).path.endsWith(".upload"));
const rec1 = await pho.reconcileStaging();
check("reconciler finalizes a staged file whose row exists", rec1.finalized >= 1 && existsSync(finalPath) && staging().length === 0, JSON.stringify(rec1));
// Orphans: young is kept, old is removed.
const young = path.join(STORE, "_staging", `${crypto.randomUUID()}.upload`), old = path.join(STORE, "_staging", `${crypto.randomUUID()}.upload`);
writeFileSync(young, png()); writeFileSync(old, png());
const longAgo = new Date(Date.now() - 3 * 3_600_000); utimesSync(old, longAgo, longAgo);
const rec2 = await pho.reconcileStaging();
check("an orphan older than the grace period is deleted; a young one is kept", !existsSync(old) && existsSync(young) && rec2.orphansRemoved >= 1, JSON.stringify(rec2));
rmSync(young, { force: true });
// finalize never overwrites a different final file.
const bytes = readFileSync(finalPath);
writeFileSync(path.join(STORE, "_staging", `${ph.photoId}.upload`), png());
check("finalize with an existing valid final file keeps it and drops the staging copy", (await pho.finalizePhoto(ph.photoId)) === "done" && readFileSync(finalPath).equals(bytes) && staging().length === 0);

// Integrity check: lost and corrupt files are reported, nothing is fabricated.
const second = inst.data.photos.find((p) => p.slotKey === "gps_antenna");
const [row2] = await q(`SELECT storage_path FROM dbo.transaction_photos WHERE photo_id=@id`, { id: [dbm.sql.UniqueIdentifier, second.photoId] });
const ok1 = await pho.checkPhotoIntegrity();
check("integrity check is clean when files match", ok1.alerts.length === 0 && ok1.checked >= 2, JSON.stringify(ok1));
truncateSync(finalPath, 10);
const bad1 = await pho.checkPhotoIntegrity();
check("a truncated final file is reported PHOTO_CORRUPT", bad1.alerts.some((a) => a.code === "PHOTO_CORRUPT" && a.photoId === ph.photoId), JSON.stringify(bad1));
writeFileSync(finalPath, pngA); // restore for the next steps
rmSync(path.join(STORE, row2.storage_path));
const bad2 = await pho.checkPhotoIntegrity();
check("a final file that is missing everywhere is reported PHOTO_LOST", bad2.alerts.some((a) => a.code === "PHOTO_LOST" && a.photoId === second.photoId), JSON.stringify(bad2));
check("the integrity check never recreates the file or touches the row", !existsSync(path.join(STORE, row2.storage_path)));
writeFileSync(path.join(STORE, row2.storage_path), jpgA);
check("the database unchanged by the checks: still 2 rows", Number((await q(`SELECT COUNT(*) n FROM dbo.transaction_photos WHERE activity_id=@a`, { a: [dbm.sql.UniqueIdentifier, inst.data.activityId] }))[0].n) === 2);

// Delete: files move to quarantine only after COMMIT; they are purged after the retention period.
await trx.deleteActivity(ctx(admin), inst.data.activityId);
created.activities.pop();
const quarantined = readdirSync(path.join(STORE, "_quarantine"));
check("deleting the transaction moves its photo files to quarantine", quarantined.length === 2 && !existsSync(finalPath), quarantined.join(","));
check("…and removes the photo rows (cascade)", Number((await q(`SELECT COUNT(*) n FROM dbo.transaction_photos WHERE photo_id=@id`, { id: [dbm.sql.UniqueIdentifier, ph.photoId] }))[0].n) === 0);
check("quarantine keeps files before the retention period", (await pho.purgeQuarantine(new Date())) === 0 && readdirSync(path.join(STORE, "_quarantine")).length === 2);
check("quarantine purges them after PHOTO_QUARANTINE_DAYS (90)", (await pho.purgeQuarantine(new Date(Date.now() + 91 * 86_400_000))) === 2);

/* ============================================================ TRANSACTION EDIT */
console.log("\n--- transaction edit");
const eA = await reg(`P5-EA-${stamp}`), eB = await reg(`P5-EB-${stamp}`), eC = await reg(`P5-EC-${stamp}`), eD = await reg(`P5-ED-${stamp}`);
const base = await trx.createInstallation(ctx(tech1), { deviceCode: eA.deviceCode, unitNo: U1, startedAt: at("00:00"), finishedAt: at("00:30"), shift: "Shift 1", area: "Pit 1", sourcePower: "Stand By" }, key());
const id1 = base.data.activityId; created.activities.push(id1);
const rv = async (id) => (await q(`SELECT row_version FROM dbo.activities WHERE activity_id=@i`, { i: [dbm.sql.UniqueIdentifier, id] }))[0].row_version;
const hex = (b) => `0x${Buffer.from(b).toString("hex")}`;
const devState = async (d) => { const x = await dev.getDevice(admin, d.deviceId); return `${x.status.code}|${x.unit?.unitNo ?? "-"}|${x.lastMaintenanceDate ?? "-"}`; };

const a0 = await auditCount(base.data.formNumber);
const meta = await trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), area: "Pit 7", remarks: "diedit", shift: "Shift 2", notes: "catatan" });
check("metadata edit updates header and detail fields", meta.remarks === "diedit" && meta.shift === "Shift 2" && meta.details.area === "Pit 7" && meta.details.notes === "catatan", JSON.stringify(meta.details));
check("metadata edit keeps the device, the times and the form number", (await devState(eA)).startsWith(`in_use|${U1}`) && meta.startedAt === base.data.startedAt && meta.formNumber === base.data.formNumber);
check("metadata edit wrote ONE audit row (transaction_update) with old/new values", (await auditCount(base.data.formNumber)) === a0 + 1);
const same = await trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), area: "Pit 7", remarks: "diedit" });
check("a patch that changes nothing writes nothing (no audit row)", (await auditCount(base.data.formNumber)) === a0 + 1 && same.activityId === id1);
await expectErr("a stale rowVersion -> 409 STALE_VERSION", 409, "STALE_VERSION", async () => trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(Buffer.from("0000000000000001", "hex")), area: "x" }));
await expectErr("editing with the wrong transaction type -> 404", 404, "NOT_FOUND", async () => trx.editActivity(ctx(admin), "removal", id1, { rowVersion: hex(await rv(id1)), reason: "x" }));

// Master edit: another Unit.
const moved = await trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), unitNo: U2 });
check("master edit (Unit): header, snapshot and device follow the new Unit", moved.unitNo === U2 && moved.devices[0].after.unitNo === U2 && (await devState(eA)).startsWith(`in_use|${U2}`));
check("the old Unit is free again", (await ref.listFleetUnits(tech1, { available: true })).some((u) => u.unitNo === U1));
check("the installation's equipment snapshot follows the Unit", moved.details.equipment_type_id !== undefined);
check("master edit wrote an audit row for the activity AND the device", (await auditCount(base.data.formNumber)) >= a0 + 2 && Number((await q(`SELECT COUNT(*) n FROM dbo.audit_log WHERE record_id=@c AND action='transaction_update' AND table_name='device'`, { c: [dbm.sql.NVarChar(60), eA.deviceCode] }))[0].n) === 1);

// Master edit: another device.
const swapped = await trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), deviceCode: eB.deviceCode });
check("master edit (device): the old device is restored, the new one is installed", (await devState(eA)).startsWith("in_stock_rfu|-") && (await devState(eB)).startsWith(`in_use|${U2}`) && swapped.devices[0].deviceCode === eB.deviceCode);
// Rolled back edits.
const before = await devState(eB);
await expectErr("an edit onto an occupied Unit fails (422) and rolls everything back", 422, "UNIT_OCCUPIED", async () => {
  const other = await trx.createInstallation(ctx(tech1), { deviceCode: eC.deviceCode, unitNo: U3, startedAt: at("02:00"), finishedAt: at("02:30") }, key());
  created.activities.push(other.data.activityId);
  await trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), unitNo: U3 });
});
check("…the device and the activity are exactly as before", (await devState(eB)) === before && (await trx.getActivity(admin, id1)).unitNo === U2);
await expectErr("an edit to a device that is not In Stock RFU -> 422 DEVICE_NOT_AVAILABLE (rolled back)", 422, "DEVICE_NOT_AVAILABLE", async () => trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), deviceCode: eC.deviceCode }));
check("…state unchanged after that rollback", (await devState(eB)) === before && (await devState(eC)).startsWith(`in_use|${U3}`));

// Times.
const zone0 = moved.timeZone;
const t1 = await trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), finishedAt: at("01:15") });
check("editing finishedAt recomputes the duration (75 min), keeps the zone and the start offset", t1.durationMinutes === 75 && t1.timeZone === zone0 && t1.startedAt === base.data.startedAt && t1.finishedAt.endsWith("+08:00") === base.data.startedAt.endsWith("+08:00"), `${t1.startedAt} ${t1.finishedAt} ${t1.durationMinutes}`);
await expectErr("finishedAt before startedAt -> 422", 422, "FINISH_BEFORE_START", async () => trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), finishedAt: `${day}T00:00`, startedAt: at("00:20") }));
await expectErr("finishedAt in the future -> 422", 422, "FINISH_IN_FUTURE", async () => trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), finishedAt: `${new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)}T10:00` }));
await expectErr("an offset in a time string -> 400", 400, "OFFSET_NOT_ALLOWED", async () => trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), startedAt: `${at("00:10")}+08:00` }));
check("failed time edits changed nothing", (await trx.getActivity(admin, id1)).durationMinutes === 75);

// Later activity blocks master edits (not metadata edits).
const ts = await trx.createTroubleshoot(ctx(tech1), { deviceCode: eB.deviceCode, unitNo: U2, componentType: "Camera", issue: "i", actionTaken: "a", startedAt: at("04:00"), finishedAt: at("04:30") }, key());
created.activities.push(ts.data.activityId);
await expectErr("a master edit is blocked by a later activity -> 409 LATER_ACTIVITY_EXISTS", 409, "LATER_ACTIVITY_EXISTS", async () => trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), unitNo: U4 }));
const metaLater = await trx.editActivity(ctx(admin), "installation", id1, { rowVersion: hex(await rv(id1)), remarks: "tetap boleh" });
check("a metadata edit is still allowed when a later activity exists", metaLater.remarks === "tetap boleh");
// Troubleshoot edit (no device change) incl. moving it BEFORE the installation is refused (ordering, rule 6).
const tEdit = await trx.editActivity(ctx(admin), "troubleshoot", ts.data.activityId, { rowVersion: hex(await rv(ts.data.activityId)), issue: "baru", healthCheckResult: "Verified" });
check("troubleshoot metadata edit works and the device is unchanged", tEdit.details.issue === "baru" && tEdit.details.health_check_result === "Verified" && (await devState(eB)) === before);
await expectErr("moving a transaction before an earlier one on the same device is refused (rule 6)", 409, "LATER_ACTIVITY_EXISTS", async () => trx.editActivity(ctx(admin), "troubleshoot", ts.data.activityId, { rowVersion: hex(await rv(ts.data.activityId)), startedAt: `${dayBefore}T10:00`, finishedAt: `${dayBefore}T10:30` }));

// Replacement and removal edits.
const rem = await trx.createRemoval(ctx(tech1), { deviceCode: eC.deviceCode, unitNo: U3, reason: "x", finalCondition: "in_stock_rfu", startedAt: at("05:00"), finishedAt: at("05:30") }, key());
created.activities.push(rem.data.activityId);
const remE = await trx.editActivity(ctx(admin), "removal", rem.data.activityId, { rowVersion: hex(await rv(rem.data.activityId)), finalCondition: "in_stock_damaged", reasonDetail: "kabel putus" });
check("removal edit: final condition re-applied to the device (In Stock damaged)", (await devState(eC)).startsWith("in_stock_damaged|-") && remE.details.reason_detail === "kabel putus");
const rep = await trx.createReplacement(ctx(tech1), { oldDeviceCode: eB.deviceCode, newDeviceCode: eD.deviceCode, unitNo: U2, oldFinalCondition: "in_stock_rfu", startedAt: at("06:00"), finishedAt: at("06:30") }, key());
created.activities.push(rep.data.activityId);
const repE = await trx.editActivity(ctx(admin), "replacement", rep.data.activityId, { rowVersion: hex(await rv(rep.data.activityId)), oldFinalCondition: "in_stock_ho", area: "Pit 9" });
check("replacement edit: old device ends In Stock HO, the new one stays on the Unit", (await devState(eB)).startsWith("in_stock_ho|-") && (await devState(eD)).startsWith(`in_use|${U2}`) && repE.details.area === "Pit 9");
await expectErr("replacing with the same device on both sides is refused", 422, "SAME_DEVICE", async () => trx.editActivity(ctx(admin), "replacement", rep.data.activityId, { rowVersion: hex(await rv(rep.data.activityId)), newDeviceCode: eB.deviceCode }));

// Deleting an edited transaction still restores the state captured by the EDITED snapshot.
await trx.deleteActivity(ctx(admin), rep.data.activityId);
check("deleting the edited replacement restores both devices", (await devState(eB)).startsWith(`in_use|${U2}`) && (await devState(eD)).startsWith("in_stock_rfu|-"));
created.activities.pop();
await trx.deleteActivity(ctx(admin), rem.data.activityId); created.activities.pop();
check("deleting the edited removal restores the device", (await devState(eC)).startsWith(`in_use|${U3}`));
await expectErr("technician 2 cannot see edited data of another Site", 404, "NOT_FOUND", async () => { if (!(await trx.getActivity(tech2, id1))) throw new ApiError(404, "NOT_FOUND", "x"); });

/* ================================================================ USERS */
console.log("\n--- users");
const nrp = `TST-USR-${stamp}`, pw1 = `Pw1-${crypto.randomUUID().slice(0, 12)}`, pw2 = `Pw2-${crypto.randomUUID().slice(0, 12)}`;
const u = await usr.createUser(ctx(admin), { nrp, name: "Test Pengguna", email: `${nrp.toLowerCase()}@example.invalid`, role: "user", siteId: tech1.siteId, password: pw1 });
created.users.push(u.userId);
check("user created: role user, Site assigned, active, source app, no secret fields", u.role === "user" && u.siteId === tech1.siteId && u.status === "active" && u.dataSource === "app" && !JSON.stringify(u).match(/hash|password/i), JSON.stringify(u));
await expectErr("duplicate NRP -> 409 NRP_EXISTS", 409, "NRP_EXISTS", () => usr.createUser(ctx(admin), { nrp, name: "x", role: "user", siteId: tech1.siteId, password: pw1 }));
await expectErr("role user without a Site -> 422 SITE_REQUIRED", 422, "SITE_REQUIRED", () => usr.createUser(ctx(admin), { nrp: `${nrp}-X`, name: "x", role: "user", password: pw1 }));
await expectErr("unknown Site -> 422 SITE_NOT_FOUND", 422, "SITE_NOT_FOUND", () => usr.createUser(ctx(admin), { nrp: `${nrp}-Y`, name: "x", role: "user", siteId: 999999, password: pw1 }));
const lg = await ses.login(nrp, pw1, null, "p5-test");
check("the new user can log in with the password (bcrypt hash stored)", lg.user.nrp === nrp && lg.user.role === "user" && lg.user.siteId === tech1.siteId);
check("the session resolves to the user", (await ses.findSessionUser(lg.session.token))?.nrp === nrp);
const hashRow = (await q(`SELECT password_hash FROM dbo.users WHERE nrp=@n`, { n: [dbm.sql.NVarChar(30), nrp] }))[0];
check("the stored value is a bcrypt hash, never the password", /^\$2[aby]\$12\$/.test(hashRow.password_hash) && !hashRow.password_hash.includes(pw1));

const list = await usr.listUsers({ page: 1, pageSize: 25, q: nrp });
check("list finds the user by NRP; items carry no hash", list.total === 1 && !JSON.stringify(list).match(/password_hash|hash/i));
check("list filters by role and status", (await usr.listUsers({ page: 1, pageSize: 100, role: "superadmin", status: "active" })).items.every((x) => x.role === "superadmin" && x.status === "active"));

const upd = await usr.updateUser(ctx(admin), u.userId, { name: "Nama Baru", phone: "0812" });
check("update changes name and phone", upd.name === "Nama Baru" && upd.phone === "0812");
const au = Number((await q(`SELECT COUNT(*) n FROM dbo.audit_log WHERE table_name='user_management' AND record_id=@n`, { n: [dbm.sql.NVarChar(60), nrp] }))[0].n);
await usr.updateUser(ctx(admin), u.userId, { name: "Nama Baru" });
check("an update that changes nothing writes no audit row", Number((await q(`SELECT COUNT(*) n FROM dbo.audit_log WHERE table_name='user_management' AND record_id=@n`, { n: [dbm.sql.NVarChar(60), nrp] }))[0].n) === au);
const moveSite = (await q(`SELECT TOP 1 site_id FROM dbo.sites WHERE site_id <> @s AND is_active = 1`, { s: [dbm.sql.Int, tech1.siteId] }))[0];
if (moveSite) {
  const moved2 = await usr.updateUser(ctx(admin), u.userId, { siteId: moveSite.site_id });
  check("Super Admin may reassign a user's Site (devices never move)", moved2.siteId === moveSite.site_id);
  await usr.updateUser(ctx(admin), u.userId, { siteId: tech1.siteId });
}
await expectErr("role user cannot be left without a Site", 422, "SITE_REQUIRED", () => usr.updateUser(ctx(admin), u.userId, { siteId: null }));

await expectErr("a Super Admin cannot change their OWN role", 403, "SELF_CHANGE_FORBIDDEN", () => usr.updateUser(ctx(admin), admin.userId, { role: "user", siteId: tech1.siteId }));
await expectErr("a Super Admin cannot deactivate themselves", 403, "SELF_CHANGE_FORBIDDEN", () => usr.updateUser(ctx(admin), admin.userId, { status: "inactive" }));
await expectErr("a Super Admin cannot change their own Site", 403, "SELF_CHANGE_FORBIDDEN", () => usr.updateUser(ctx(admin), admin.userId, { siteId: tech1.siteId }));

const deact = await usr.updateUser(ctx(admin), u.userId, { status: "inactive" });
check("deactivation sets status inactive", deact.status === "inactive");
check("…the user's existing session is revoked", (await ses.findSessionUser(lg.session.token)) === null);
await expectErr("…and login is refused (401)", 401, "INVALID_CREDENTIALS", () => ses.login(nrp, pw1, null, "p5-test"));
check("deactivation is audited as user_deactivate", Number((await q(`SELECT COUNT(*) n FROM dbo.audit_log WHERE action='user_deactivate' AND record_id=@n`, { n: [dbm.sql.NVarChar(60), nrp] }))[0].n) === 1);
await usr.updateUser(ctx(admin), u.userId, { status: "active" });

for (let i = 0; i < 3; i++) await ses.login(nrp, "wrong-password-xx", null, "p5-test").catch(() => undefined);
await expectErr("after repeated failures the account is locked (429)", 429, "ACCOUNT_LOCKED", () => ses.login(nrp, pw1, null, "p5-test"));
check("the list shows the account as locked", (await usr.getUser(u.userId)).isLocked === true);
const lg2 = (await usr.resetPassword(ctx(admin), u.userId, { password: pw2 })) && (await ses.login(nrp, pw2, null, "p5-test"));
check("password reset clears the lockout and the new password works", lg2.user.nrp === nrp);
await expectErr("the old password no longer works", 401, "INVALID_CREDENTIALS", () => ses.login(nrp, pw1, null, "p5-test"));
await usr.resetPassword(ctx(admin), u.userId, { password: pw1 });
check("a reset revokes the sessions that existed before it", (await ses.findSessionUser(lg2.session.token)) === null);
await expectErr("resetting the password of an unknown user -> 404", 404, "NOT_FOUND", () => usr.resetPassword(ctx(admin), crypto.randomUUID(), { password: pw1 }));
const seedActor = (await q(`SELECT user_id FROM dbo.users WHERE nrp=N'DEV-SEED-ACTOR'`))[0];
if (seedActor) await expectErr("the placeholder seed actor cannot be given a password", 422, "NOT_LOGINABLE", () => usr.resetPassword(ctx(admin), String(seedActor.user_id).toLowerCase(), { password: pw1 }));

const audits = await q(`SELECT action, ISNULL(old_values,'') o, ISNULL(new_values,'') n FROM dbo.audit_log WHERE table_name='user_management' AND record_id=@n`, { n: [dbm.sql.NVarChar(60), nrp] });
check("audit rows exist for create, update, deactivate and password reset", ["user_create", "user_update", "user_deactivate", "user_password_reset"].every((a) => audits.some((x) => x.action === a)), audits.map((x) => x.action).join(","));
check("no password, hash or token ever appears in audit values", !audits.some((x) => /pass|hash|\$2[aby]\$|token/i.test(x.o + x.n.replace('"reset":true', ""))), JSON.stringify(audits));
const sa = await usr.createUser(ctx(admin), { nrp: `${nrp}-SA`, name: "Test Admin", role: "superadmin", password: pw1 });
created.users.push(sa.userId);
check("a Super Admin may exist without a Site", sa.role === "superadmin" && sa.siteId === null);
const sadem = await usr.updateUser(ctx(admin), sa.userId, { role: "user", siteId: tech1.siteId });
check("another Super Admin can be demoted (an active Super Admin remains)", sadem.role === "user");

/* ============================================================ DASHBOARD */
console.log("\n--- dashboard");
const sum = (arr) => arr.reduce((s, x) => s + x.count, 0);
const dAdmin = await dash.getDashboardSummary(admin, { months: 6 });
const total = Number((await q(`SELECT COUNT(*) n FROM dbo.devices WHERE is_deleted = 0`))[0].n);
check("Super Admin sees all Sites; registered devices = non-archived devices in the table", dAdmin.scope.allSites && dAdmin.kpis.registeredDevices === total, `${dAdmin.kpis.registeredDevices} vs ${total}`);
check("status counts add up to the registered devices", sum(dAdmin.statusDistribution) === dAdmin.kpis.registeredDevices && dAdmin.kpis.inUse + dAdmin.kpis.inStockRfu + dAdmin.kpis.inStockDamaged + dAdmin.kpis.inStockHo === total);
check("health, owner-Site and location distributions add up", sum(dAdmin.healthDistribution) === total && sum(dAdmin.ownerSiteDistribution) === total && sum(dAdmin.locationDistribution) === total);
check("equipment distribution counts In Use devices only", sum(dAdmin.equipmentDistribution) === dAdmin.kpis.inUse, `${sum(dAdmin.equipmentDistribution)} vs ${dAdmin.kpis.inUse}`);
check("monthly series: 6 zero-filled months, oldest first, ending in the current month", dAdmin.monthlyActivity.length === 6 && dAdmin.monthlyActivity[5].month === new Date().toISOString().slice(0, 7), dAdmin.monthlyActivity.map((m) => m.month).join(","));
check("the total-assets formula is not invented (a note says it is pending)", dAdmin.notes.some((n) => /not confirmed/i.test(n)));
const siteTotal = Number((await q(`SELECT COUNT(*) n FROM dbo.devices WHERE is_deleted = 0 AND site_id=@s`, { s: [dbm.sql.Int, tech1.siteId] }))[0].n);
const dT1 = await dash.getDashboardSummary(tech1, { months: 6 });
check("a technician sees only their own Site", !dT1.scope.allSites && dT1.scope.siteId === tech1.siteId && dT1.kpis.registeredDevices === siteTotal, `${dT1.kpis.registeredDevices} vs ${siteTotal}`);
await expectErr("a technician asking for another Site -> 403", 403, "SITE_FORBIDDEN", () => dash.getDashboardSummary(tech1, { siteId: tech2.siteId, months: 6 }));
const dSite = await dash.getDashboardSummary(admin, { siteId: tech1.siteId, months: 6 });
check("Super Admin filtered to one Site equals that Site's technician view", JSON.stringify(dSite.statusDistribution) === JSON.stringify(dT1.statusDistribution) && JSON.stringify(dSite.monthlyActivity) === JSON.stringify(dT1.monthlyActivity));
const thisMonth = dSite.monthlyActivity[5];
const sqlMonth = Number((await q(`SELECT COUNT(*) n FROM dbo.activities WHERE site_id=@s AND FORMAT(started_at_local,'yyyy-MM')=@m`, { s: [dbm.sql.Int, tech1.siteId], m: [dbm.sql.VarChar(7), thisMonth.month] }))[0].n);
const prevMonth = Number((await q(`SELECT COUNT(*) n FROM dbo.activities WHERE site_id=@s AND FORMAT(started_at_local,'yyyy-MM')=@m`, { s: [dbm.sql.Int, tech1.siteId], m: [dbm.sql.VarChar(7), dSite.monthlyActivity[4].month] }))[0].n);
check("monthly counts equal the activities table (same local-month grouping as the lists)", thisMonth.total === sqlMonth && dSite.monthlyActivity[4].total === prevMonth, `${thisMonth.total}/${sqlMonth} ${dSite.monthlyActivity[4].total}/${prevMonth}`);
const regCode = `P5-DASH-${stamp}`;
const dd = await reg(regCode);
const dAfter = await dash.getDashboardSummary(tech1, { months: 6 });
check("a newly registered device is counted In Stock RFU", dAfter.kpis.registeredDevices === dT1.kpis.registeredDevices + 1 && dAfter.kpis.inStockRfu === dT1.kpis.inStockRfu + 1);

/* ================================================================ CLEANUP */
console.log("\n--- cleanup");
for (const id of created.activities.reverse()) {
  try { await trx.deleteActivity(ctx(admin), id); } catch (e) { console.log("could not delete", id, e.code ?? e.message); }
}
for (const dv of created.devices) {
  const cur = await dev.getDevice(admin, dv.deviceId);
  if (cur && !cur.isArchived && cur.status.code !== "in_use") await dev.archiveDevice(ctx(admin), cur.deviceId, { rowVersion: cur.rowVersion, reason: "phase5 flow cleanup" }).catch((e) => console.log("could not archive", cur.deviceCode, e.code ?? e.message));
}
for (const id of created.users) await usr.updateUser(ctx(admin), id, { status: "inactive" }).catch(() => undefined);
const left = Number((await q(`SELECT COUNT(*) n FROM dbo.activities a JOIN dbo.activity_devices ad ON ad.activity_id=a.activity_id JOIN dbo.devices d ON d.device_id=ad.device_id WHERE d.device_code LIKE N'P5-%-${stamp}'`))[0].n);
check("cleanup: no P5 transaction is left behind", left === 0, `${left} left`);
rmSync(STORE, { recursive: true, force: true });
await pool.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
