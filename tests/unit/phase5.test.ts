// Unit tests for the Phase 5 backend modules (photos, multipart, transaction edit, users, dashboard).
// No database is needed. Run: npm run test:unit
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApiError } from "../../src/server/errors.ts";
import { redact } from "../../src/server/audit.ts";
import { buildMonthly, monthRange } from "../../src/server/dashboard.ts";
import {
  createUserSchema,
  dashboardQuery,
  editInstallationSchema,
  editRemovalSchema,
  editReplacementSchema,
  editTroubleshootSchema,
  installationSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "../../src/server/validators.ts";

const ROOT = mkdtempSync(join(tmpdir(), "mh02-photos-"));
const STAGE_ROOT = join(ROOT, "storage");
// The config module needs these before the first read; nothing connects to a database in these tests.
Object.assign(process.env, {
  DB_SERVER: "localhost",
  DB_NAME: "unit_test",
  DB_USER: "mh02_app",
  DB_PASSWORD: "unit-test-only",
  PHOTO_STORAGE_ROOT: STAGE_ROOT,
  PHOTO_MAX_BYTES: "4096",
});

const photos = await import("../../src/server/photos.ts");
const multipart = await import("../../src/server/multipart.ts");
const tx = await import("../../src/server/transactions.ts");
const users = await import("../../src/server/users.ts");

after(() => rmSync(ROOT, { recursive: true, force: true }));
before(() => undefined);

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

async function rejects(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: unknown) => e instanceof ApiError && e.code === code, `expected ${code}`);
}

/* ------------------------------------------------------------------ photos */

test("image type comes from the magic bytes, never from the name or declared type", () => {
  assert.equal(photos.sniffImageType(PNG), "image/png");
  assert.equal(photos.sniffImageType(JPEG), "image/jpeg");
  assert.equal(photos.sniffImageType(WEBP), "image/webp");
  assert.equal(photos.sniffImageType(new TextEncoder().encode("GIF89a......")), null);
  assert.equal(photos.sniffImageType(new TextEncoder().encode("<svg xmlns='x'></svg>")), null);
  assert.equal(photos.sniffImageType(new Uint8Array(0)), null);
  // RIFF that is not WebP (for example WAV) is refused.
  assert.equal(photos.sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null);
});

test("final path is relative, derived from the id and the validated type, in UTC year/month", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assert.equal(photos.finalPathFor(id, "image/png", new Date("2026-11-30T23:59:00Z")), `photos/2026/11/${id}.png`);
  assert.equal(photos.finalPathFor(id, "image/jpeg", new Date("2027-01-01T00:00:00Z")), `photos/2027/01/${id}.jpg`);
  assert.equal(photos.finalPathFor(id, "image/webp", new Date("2026-02-03T00:00:00Z")), `photos/2026/02/${id}.webp`);
});

test("safeJoin refuses anything that could leave the storage root", () => {
  for (const bad of ["../x", "a/../../x", "/etc/passwd", "\\windows", "C:/x", "", "a\0b"]) {
    assert.throws(() => photos.safeJoin(STAGE_ROOT, bad), /unsafe/, bad);
  }
  assert.ok(photos.safeJoin(STAGE_ROOT, "photos/2026/11/x.png").startsWith(STAGE_ROOT));
});

test("photo slots match the approved UI and are limited per transaction type", () => {
  assert.deepEqual([...photos.PHOTO_SLOTS.installation], ["mh02_installed", "camera_dashboard_angle", "nodered_config", "gps_antenna"]);
  assert.deepEqual([...photos.PHOTO_SLOTS.replacement], ["mh02_new_installed", "mh02_old_removed", "nodered_config", "gps_antenna"]);
  assert.deepEqual([...photos.PHOTO_SLOTS.removal], ["beforeDevice", "componentSet"]);
  assert.deepEqual([...photos.PHOTO_SLOTS.troubleshoot], ["beforeRepair", "afterRepair"]);
  assert.equal(photos.isAllowedSlot("removal", "mh02_installed"), false);
  assert.equal(photos.isAllowedSlot("installation", "mh02_installed"), true);
  for (const slots of Object.values(photos.PHOTO_SLOTS)) for (const s of slots) assert.ok(s.length <= 40, "slot_key is VARCHAR(40)");
});

test("staging validates, writes only .upload files and can be discarded", async () => {
  const staged = await photos.stagePhotos("installation", [
    { slotKey: "mh02_installed", data: PNG, filename: "../../evil.png", caption: " front " },
    { slotKey: "gps_antenna", data: JPEG },
  ]);
  assert.equal(staged.length, 2);
  const a = staged[0];
  assert.equal(a.mimeType, "image/png");
  assert.equal(a.caption, "front");
  assert.equal(a.sizeBytes, PNG.length);
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.ok(a.storagePath.startsWith("photos/") && a.storagePath.endsWith(`${a.photoId}.png`));
  assert.ok(!a.originalFilename?.includes("/"), "client path separators are neutralized");
  const upload = join(STAGE_ROOT, "_staging", `${a.photoId}.upload`);
  assert.ok(existsSync(upload));
  assert.ok(!existsSync(join(STAGE_ROOT, "_staging", `${a.photoId}.part`)), "no .part left behind");
  assert.deepEqual(readFileSync(upload), Buffer.from(PNG));
  assert.ok(existsSync(join(STAGE_ROOT, ".storage-ok")));
  await photos.discardStaged(staged);
  assert.ok(!existsSync(upload));
});

test("staging rejects invalid input and leaves nothing behind", async () => {
  await rejects(photos.stagePhotos("installation", [{ slotKey: "beforeRepair", data: PNG }]), "PHOTO_SLOT_INVALID");
  await rejects(photos.stagePhotos("installation", [{ slotKey: "gps_antenna", data: PNG }, { slotKey: "gps_antenna", data: PNG }]), "PHOTO_SLOT_DUPLICATE");
  await rejects(photos.stagePhotos("installation", [{ slotKey: "gps_antenna", data: new Uint8Array(0) }]), "PHOTO_EMPTY");
  await rejects(photos.stagePhotos("installation", [{ slotKey: "gps_antenna", data: new Uint8Array(5000).fill(0xff) }]), "PHOTO_TOO_LARGE");
  await rejects(photos.stagePhotos("installation", [{ slotKey: "gps_antenna", data: new TextEncoder().encode("not an image at all") }]), "PHOTO_TYPE_INVALID");
  await rejects(photos.stagePhotos("installation", [{ slotKey: "gps_antenna", data: PNG, caption: "x".repeat(201) }]), "PHOTO_CAPTION_TOO_LONG");
  // A valid first photo followed by an invalid second one: the first must be cleaned up.
  const before = (await import("node:fs")).readdirSync(join(STAGE_ROOT, "_staging")).length;
  await rejects(
    photos.stagePhotos("installation", [{ slotKey: "gps_antenna", data: PNG }, { slotKey: "mh02_installed", data: new TextEncoder().encode("nope nope nope") }]),
    "PHOTO_TYPE_INVALID"
  );
  assert.equal((await import("node:fs")).readdirSync(join(STAGE_ROOT, "_staging")).length, before);
  const nine = Array.from({ length: 9 }, (_, i) => ({ slotKey: `s${i}`, data: PNG }));
  await rejects(photos.stagePhotos("installation", nine), "TOO_MANY_PHOTOS");
});

test("the fingerprint is order-independent so an idempotent retry hashes the same", async () => {
  const [a, b] = await photos.stagePhotos("installation", [{ slotKey: "gps_antenna", data: PNG }, { slotKey: "mh02_installed", data: JPEG }]);
  const f1 = photos.photosFingerprint([a, b]);
  const f2 = photos.photosFingerprint([b, a]);
  assert.deepEqual(f1, f2);
  assert.ok(!JSON.stringify(f1).includes(a.photoId), "random photo ids must not enter the request hash");
  await photos.discardStaged([a, b]);
});

/* --------------------------------------------------------------- multipart */

function multipartRequest(parts: Record<string, string | Blob>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(parts)) { if (v instanceof Blob) form.append(k, v, "x.png"); else form.append(k, v); }
  return new Request("http://localhost/api/installations", { method: "POST", body: form, headers });
}
const installPayload = JSON.stringify({ startedAt: "2026-11-01T08:00", finishedAt: "2026-11-01T09:00", deviceCode: "D1", unitNo: "U1" });

test("multipart: payload and photo:<slot> files are parsed with the same strict schema", async () => {
  const req = multipartRequest({
    payload: installPayload,
    "photo:mh02_installed": new Blob([PNG], { type: "image/png" }),
    "caption:mh02_installed": "terpasang",
  });
  const parsed = await multipart.parseTransactionRequest(req, installationSchema);
  assert.equal(parsed.input.deviceCode, "D1");
  assert.equal(parsed.photos.length, 1);
  assert.equal(parsed.photos[0].slotKey, "mh02_installed");
  assert.equal(parsed.photos[0].caption, "terpasang");
  assert.deepEqual(Buffer.from(parsed.photos[0].data), Buffer.from(PNG));
});

test("multipart: plain JSON still works and a client status/duration is still rejected", async () => {
  const ok = await multipart.parseTransactionRequest(
    new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: installPayload }),
    installationSchema
  );
  assert.equal(ok.photos.length, 0);
  const bad = JSON.stringify({ ...JSON.parse(installPayload), status: "completed", durationMinutes: 5 });
  await assert.rejects(multipart.parseTransactionRequest(multipartRequest({ payload: bad }), installationSchema));
});

test("multipart: missing payload, bad JSON, unknown field, orphan caption and oversize are 400", async () => {
  await rejects(multipart.parseTransactionRequest(multipartRequest({ x: "1" }), installationSchema), "PAYLOAD_REQUIRED");
  await rejects(multipart.parseTransactionRequest(multipartRequest({ payload: "{nope" }), installationSchema), "INVALID_JSON");
  await rejects(multipart.parseTransactionRequest(multipartRequest({ payload: installPayload, extra: "1" }), installationSchema), "UNKNOWN_FORM_FIELD");
  await rejects(
    multipart.parseTransactionRequest(multipartRequest({ payload: installPayload, "caption:gps_antenna": "c" }), installationSchema),
    "CAPTION_WITHOUT_PHOTO"
  );
  await rejects(
    multipart.parseTransactionRequest(multipartRequest({ payload: installPayload, "photo:gps_antenna": new Blob([new Uint8Array(5000)]) }), installationSchema),
    "PHOTO_TOO_LARGE"
  );
  await rejects(
    multipart.parseTransactionRequest(multipartRequest({ payload: installPayload }, { "content-length": "999999999" }), installationSchema),
    "REQUEST_TOO_LARGE"
  );
});

/* ------------------------------------------------------------ transaction edit */

test("edit schemas: partial, need rowVersion, reject Site, status, duration, zone and offsets", () => {
  const rv = "0x00000000000007D1";
  assert.ok(editInstallationSchema.safeParse({ rowVersion: rv }).success);
  assert.ok(editInstallationSchema.safeParse({ rowVersion: rv, area: "Pit 3", unitNo: "U2" }).success);
  assert.ok(editReplacementSchema.safeParse({ rowVersion: rv, oldFinalCondition: "in_stock_damaged" }).success);
  assert.ok(editRemovalSchema.safeParse({ rowVersion: rv, reason: "x" }).success);
  assert.ok(editTroubleshootSchema.safeParse({ rowVersion: rv, issue: "x" }).success);
  assert.equal(editInstallationSchema.safeParse({ area: "x" }).success, false, "rowVersion is required");
  for (const forbidden of [{ siteId: 2 }, { status: "completed" }, { durationMinutes: 3 }, { timeZone: "Asia/Jakarta" }, { utcOffset: 480 }, { start_utc_offset_minutes: 480 }]) {
    assert.equal(editInstallationSchema.safeParse({ rowVersion: rv, ...forbidden }).success, false, JSON.stringify(forbidden));
  }
  assert.equal(editInstallationSchema.safeParse({ rowVersion: "7D1" }).success, false);
});

test("diffPatch: only real changes count; master edits are told apart from metadata edits", () => {
  const current = { startedAt: "2026-11-01T08:00", unitNo: "U1", area: "Pit 3", remarks: null, deviceCode: "D1" };
  assert.deepEqual(tx.diffPatch(current, { rowVersion: "x", area: "Pit 3", unitNo: "U1" }), [], "repeating a value changes nothing");
  assert.deepEqual(tx.diffPatch(current, { rowVersion: "x", remarks: "" }), [], "blank equals null");
  assert.deepEqual(tx.diffPatch(current, { rowVersion: "x", area: " Pit 4 ", remarks: "ok" }), ["area", "remarks"]);
  assert.deepEqual(tx.diffPatch(current, { rowVersion: "x", area: undefined }), []);
  assert.equal(tx.isMasterEdit(["area", "remarks", "shift"]), false);
  for (const f of ["startedAt", "finishedAt", "deviceCode", "oldDeviceCode", "newDeviceCode", "unitNo", "finalCondition", "oldFinalCondition"]) {
    assert.equal(tx.isMasterEdit(["area", f]), true, f);
  }
});

/* ------------------------------------------------------------------- users */

test("user schemas: strict, password policy, role values, no password in update", () => {
  const ok = { nrp: "TECH-001", name: "Budi", role: "user", siteId: 1, password: "Correct-Horse-9" };
  assert.ok(createUserSchema.safeParse(ok).success);
  assert.equal(createUserSchema.safeParse({ ...ok, password: "short" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...ok, role: "admin" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...ok, nrp: "a b" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...ok, status: "active" }).success, false, "status is not accepted at creation");
  assert.equal(createUserSchema.safeParse({ ...ok, dataSource: "dev_seed" }).success, false);
  assert.ok(updateUserSchema.safeParse({ status: "inactive" }).success);
  assert.ok(updateUserSchema.safeParse({ email: null, siteId: null }).success);
  assert.equal(updateUserSchema.safeParse({ password: "x".repeat(12) }).success, false, "passwords change only through the reset endpoint");
  assert.equal(updateUserSchema.safeParse({ nrp: "NEW" }).success, false, "NRP is immutable");
  assert.ok(resetPasswordSchema.safeParse({ password: "Another-Strong-1" }).success);
  assert.equal(resetPasswordSchema.safeParse({ password: "short" }).success, false);
});

test("a regular user needs a Site; a Super Admin may have none", () => {
  assert.throws(() => users.checkRoleSite("user", null), (e: unknown) => e instanceof ApiError && e.code === "SITE_REQUIRED");
  users.checkRoleSite("user", 3);
  users.checkRoleSite("superadmin", null);
  users.checkRoleSite("superadmin", 3);
});

test("audit redaction keeps the reset marker but drops passwords, hashes and tokens", () => {
  const out = redact({ reset: true, password: "x", password_hash: "y", nested: { token: "t", nrp: "N1" } });
  assert.deepEqual(out, { reset: true, nested: { nrp: "N1" } });
});

/* --------------------------------------------------------------- dashboard */

test("month range crosses year boundaries and is oldest-first", () => {
  assert.deepEqual(monthRange("2026-02", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(monthRange("2026-11", 1), ["2026-11"]);
  assert.equal(monthRange("2026-11", 36).length, 36);
});

test("monthly series is zero-filled and ignores rows outside the range", () => {
  const months = monthRange("2026-11", 3);
  const series = buildMonthly(months, [
    { month: "2026-10", type: "installation", n: 2 },
    { month: "2026-10", type: "removal", n: 1 },
    { month: "2026-11", type: "troubleshoot", n: 4 },
    { month: "2026-01", type: "installation", n: 99 },
    { month: "2026-11", type: "unknown_type", n: 7 },
  ]);
  assert.deepEqual(series.map((p) => p.month), months);
  assert.deepEqual(series[0], { month: "2026-09", installation: 0, replacement: 0, removal: 0, troubleshoot: 0, total: 0 });
  assert.equal(series[1].total, 3);
  assert.equal(series[2].troubleshoot, 4);
  assert.equal(series[2].total, 4);
});

test("dashboard query: months default 12 and are bounded", () => {
  assert.equal(dashboardQuery.parse({}).months, 12);
  assert.equal(dashboardQuery.safeParse({ months: "0" }).success, false);
  assert.equal(dashboardQuery.safeParse({ months: "37" }).success, false);
});

/* ---------------------------------------------------------- schema contract */

test("photo inserts and the new services only use columns and values the migrations define", () => {
  const v4 = readFileSync(new URL("../../database/migrations/V004__transaction_photos.sql", import.meta.url), "utf8");
  const code = readFileSync(new URL("../../src/server/photos.ts", import.meta.url), "utf8");
  const insert = /INSERT INTO dbo\.transaction_photos\s*\(([^)]+)\)/.exec(code);
  assert.ok(insert, "photo insert found");
  for (const col of insert[1].split(",").map((c) => c.trim())) assert.ok(new RegExp(`\\b${col}\\b`).test(v4), `column ${col} missing in V004`);
  assert.match(v4, /photo_id\s+UNIQUEIDENTIFIER NOT NULL,\s+-- supplied by the service on INSERT; NO default/);
});
