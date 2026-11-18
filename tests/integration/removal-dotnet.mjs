import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(process.env.DOTNET_TEST_URL ?? "http://localhost:5000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Development loopback URL required.");
assert.equal(base.protocol, "http:");
assert.equal(base.username, "");
assert.equal(base.password, "");

async function request(method, path, { cookie, body, key } = {}) {
  const headers = { origin: base.origin };
  if (cookie) headers.cookie = `mh02_session=${cookie}`;
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch(new URL(path, base), { method, headers, body, redirect: "manual" });
  return { status: response.status, json: await response.json().catch(() => null), headers: response.headers };
}

for (const [method, path] of [
  ["GET", "/api/removals"], ["GET", "/api/removals/REM-200001-999"],
  ["POST", "/api/removals"], ["PATCH", "/api/removals/REM-200001-999"], ["DELETE", "/api/removals/REM-200001-999"],
]) {
  assert.equal((await request(method, path)).status, 401, `${method} ${path} must require authentication.`);
}
console.log("PASS: removal CRUD routes require authentication.");
if (process.env.REMOVAL_TEST_WRITE !== "development-fixture") {
  console.log("SKIP: authenticated CRUD requires REMOVAL_TEST_WRITE=development-fixture and MH02_TEST_SESSION.");
  process.exit(0);
}
const cookie = process.env.MH02_TEST_SESSION;
assert.ok(cookie && /^[A-Za-z0-9_=-]+$/.test(cookie), "A valid MH02_TEST_SESSION is required; never commit this token.");
const me = await request("GET", "/api/auth/me", { cookie });
assert.equal(me.status, 200);
assert.equal(me.json.role, "superadmin");
const reference = await request("GET", "/api/reference", { cookie });
assert.equal(reference.status, 200);
const site = reference.json.sites.find((item) => item.siteCode === "DEV-REMOVAL");
assert.ok(site, "Review and apply 008_removal_development_seed.sql first.");

async function device() {
  const result = await request("GET", `/api/devices?siteId=${site.siteId}&q=DEV-REM-MH02-001&pageSize=100`, { cookie });
  assert.equal(result.status, 200);
  const found = result.json.items.find((item) => item.deviceCode === "DEV-REM-MH02-001");
  assert.ok(found);
  return found;
}
function state(item) {
  return { status: item.status.code, unit: item.unit?.unitNo ?? null, location: item.locationSiteId, maintenance: item.lastMaintenanceDate };
}
function localTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: site.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
const before = await device();
assert.equal(before.status.code, "in_use");
assert.equal(before.unit.unitNo, "DEV-REM-DT-001");
const payload = {
  siteId: site.siteId, deviceCode: before.deviceCode,
  startedAt: localTime(new Date(Date.now() - 10 * 60000)), finishedAt: localTime(new Date(Date.now() - 5 * 60000)),
  finalCondition: "in_stock_damaged", reason: "Kerusakan", reasonDetail: "Development fixture inspection",
  shift: "Shift 1", groupLeader: "Development Removal GL", remarks: "Development removal CRUD test", keepPhotoSlots: [],
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==", "base64");
function multipart(input, slots = []) {
  const form = new FormData();
  form.append("payload", JSON.stringify(input));
  for (const slot of slots) {
    form.append(`photo:${slot}`, new Blob([png], { type: "image/png" }), `${slot}.png`);
    form.append(`caption:${slot}`, "Development photo");
  }
  return form;
}

const slots = ["before_device", "component_set"];
const key = randomUUID();
let formNumber;
let deleted = false;
try {
  const missingPhotos = await request("POST", "/api/removals", { cookie, key, body: multipart(payload) });
  assert.equal(missingPhotos.status, 400);
  assert.equal(missingPhotos.json.error.code, "PHOTO_REQUIRED");
  const created = await request("POST", "/api/removals", { cookie, key, body: multipart(payload, slots) });
  assert.equal(created.status, 201, created.json?.error?.code);
  formNumber = created.json.formNumber;
  assert.match(formNumber, /^REM-\d{6}-\d{3,}$/);
  const replay = await request("POST", "/api/removals", { cookie, key, body: multipart(payload, slots) });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.formNumber, formNumber);
  assert.equal(replay.headers.get("idempotency-replayed"), "true");
  const reused = await request("POST", "/api/removals", { cookie, key, body: multipart({ ...payload, reason: "Upgrade" }, slots) });
  assert.equal(reused.status, 422);
  assert.equal(reused.json.error.code, "IDEMPOTENCY_KEY_REUSED");
  const removedState = await device();
  assert.equal(removedState.status.code, "in_stock_damaged");
  assert.equal(removedState.unit, null);
  assert.equal(removedState.locationSiteId, before.locationSiteId);
  const detail = await request("GET", `/api/removals/${formNumber}`, { cookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.unitNo, before.unit.unitNo);
  const photo = await fetch(new URL(detail.json.photos.beforeDevice.replace(/^\/api\/dotnet\//, "/api/"), base), { headers: { cookie: `mh02_session=${cookie}` } });
  assert.equal(photo.status, 200);
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);

  const edit = { ...payload, rowVersion: detail.json.rowVersion,
    startedAt: localTime(new Date(Date.now() - 9 * 60000)), finishedAt: localTime(new Date(Date.now() - 4 * 60000)),
    finalCondition: "in_stock_ho", remarks: "Edited development notes", keepPhotoSlots: ["before_device"],
    photoCaptions: { before_device: "Edited caption" } };
  const updated = await request("PATCH", `/api/removals/${formNumber}`, { cookie, body: multipart(edit, ["component_set"]) });
  assert.equal(updated.status, 200, updated.json?.error?.code);
  assert.notEqual(updated.json.rowVersion, detail.json.rowVersion);
  const stale = await request("PATCH", `/api/removals/${formNumber}`, { cookie, body: multipart(edit, ["component_set"]) });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "STALE_VERSION");
  const edited = await request("GET", `/api/removals/${formNumber}`, { cookie });
  assert.equal(edited.json.deviceFinalCondition, "in_stock_ho");
  assert.equal(edited.json.startTime, edit.startedAt);
  assert.equal(edited.json.remarks, edit.remarks);
  assert.equal(edited.json.photos.beforeDeviceCaption, "Edited caption");
  assert.notEqual(edited.json.photos.componentSet, detail.json.photos.componentSet);
  const updatedDevice = await device();
  assert.equal(updatedDevice.status.code, "in_stock_ho");
  assert.equal(updatedDevice.locationSiteId, before.locationSiteId);
  assert.equal(updatedDevice.unit, null);
  const future = await request("PATCH", `/api/removals/${formNumber}`, { cookie, body: multipart({ ...edit,
    rowVersion: updated.json.rowVersion, keepPhotoSlots: slots, finishedAt: localTime(new Date(Date.now() + 10 * 60000)),
  }) });
  assert.equal(future.status, 422);
  assert.equal(future.json.error.code, "INVALID_DATETIME");
  assert.equal((await request("GET", `/api/removals/${formNumber}`, { cookie })).json.rowVersion, updated.json.rowVersion);
  const removed = await request("DELETE", `/api/removals/${formNumber}`, { cookie });
  assert.equal(removed.status, 200, removed.json?.error?.code);
  deleted = true;
  assert.deepEqual(state(await device()), state(before));
  assert.equal((await request("GET", `/api/removals/${formNumber}`, { cookie })).status, 404);
  console.log("PASS: removal create/replay, photos, state/time update, captions, stale version, future guard, delete and rollback.");
} finally {
  if (formNumber && !deleted) {
    const cleanup = await request("DELETE", `/api/removals/${formNumber}`, { cookie });
    if (cleanup.status !== 200) console.error(`Fixture cleanup needs review for ${formNumber}; response ${cleanup.status}.`);
  }
}