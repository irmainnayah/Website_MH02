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
  const json = await response.json().catch(() => null);
  return { status: response.status, json, headers: response.headers };
}

for (const [method, path] of [
  ["GET", "/api/replacements"],
  ["GET", "/api/replacements/REP-200001-999"],
  ["POST", "/api/replacements"],
  ["PATCH", "/api/replacements/REP-200001-999"],
  ["DELETE", "/api/replacements/REP-200001-999"],
]) {
  const response = await request(method, path);
  assert.equal(response.status, 401, `${method} ${path} must require authentication.`);
}
console.log("PASS: replacement CRUD routes require authentication.");

if (process.env.REPLACEMENT_TEST_WRITE !== "development-fixture") {
  console.log("SKIP: authenticated CRUD requires REPLACEMENT_TEST_WRITE=development-fixture and MH02_TEST_SESSION.");
  process.exit(0);
}

const cookie = process.env.MH02_TEST_SESSION;
assert.ok(cookie && /^[A-Za-z0-9_=-]+$/.test(cookie), "A valid MH02_TEST_SESSION is required; never commit this token.");
const me = await request("GET", "/api/auth/me", { cookie });
assert.equal(me.status, 200);
assert.equal(me.json.role, "superadmin", "Superadmin fixture session required.");
const reference = await request("GET", "/api/reference", { cookie });
assert.equal(reference.status, 200);
const site = reference.json.sites.find((item) => item.siteCode === "DEV-REPLACEMENT");
assert.ok(site, "Review and apply 006_replacement_development_seed.sql first.");

async function devices() {
  const result = await request("GET", `/api/devices?siteId=${site.siteId}&q=DEV-REP-&pageSize=100`, { cookie });
  assert.equal(result.status, 200);
  return result.json.items;
}

function state(device) {
  return { status: device.status.code, unit: device.unit?.unitNo ?? null, location: device.locationSiteId, maintenance: device.lastMaintenanceDate };
}

const before = await devices();
const old = before.find((device) => device.deviceCode === "DEV-REP-OLD-001");
const replacement = before.find((device) => device.deviceCode === "DEV-REP-NEW-001");
assert.equal(old?.status.code, "in_use");
assert.equal(replacement?.status.code, "in_stock_rfu");
assert.equal(old?.unit?.unitNo, "DEV-REP-DT-001");

function localTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: site.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

const payload = {
  siteId: site.siteId,
  startedAt: localTime(new Date(Date.now() - 10 * 60000)),
  finishedAt: localTime(new Date(Date.now() - 5 * 60000)),
  oldDeviceCode: old.deviceCode,
  newDeviceCode: replacement.deviceCode,
  oldFinalStatus: "in_stock_damaged",
  shift: "Shift 1",
  groupLeader: "Development Replacement GL",
  sourcePower: "Stand By",
  spmVersion: "Development Replacement SPM Test",
  ipAddress: "192.0.2.10",
  ipCpe: "192.0.2.11",
  ipVhms: "192.0.2.12",
  remarks: "Development replacement CRUD integration test",
  keepPhotoSlots: [],
};
const slots = ["mh02_new_installed", "mh02_old_removed", "nodered_config", "gps_antenna"];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==", "base64");

function multipart(input, photos = false) {
  const form = new FormData();
  form.append("payload", JSON.stringify(input));
  if (photos) for (const slot of slots) {
    form.append(`photo:${slot}`, new Blob([png], { type: "image/png" }), `${slot}.png`);
    form.append(`caption:${slot}`, "Development test photo");
  }
  return form;
}

const key = randomUUID();
let formNumber;
let deleted = false;
try {
  const created = await request("POST", "/api/replacements", { cookie, key, body: multipart(payload, true) });
  assert.equal(created.status, 201, created.json?.error?.code);
  formNumber = created.json.formNumber;
  assert.match(formNumber, /^REP-\d{6}-\d{3,}$/);
  const replay = await request("POST", "/api/replacements", { cookie, key, body: multipart(payload, true) });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("idempotency-replayed"), "true");
  assert.equal(replay.json.formNumber, formNumber);

  const after = await devices();
  assert.equal(after.find((device) => device.deviceCode === old.deviceCode).status.code, "in_stock_damaged");
  assert.equal(after.find((device) => device.deviceCode === replacement.deviceCode).unit.unitNo, old.unit.unitNo);

  const detail = await request("GET", `/api/replacements/${formNumber}`, { cookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.photos.length, 4);
  const photo = await fetch(new URL(detail.json.photos[0].url, base), { headers: { cookie: `mh02_session=${cookie}` } });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);

  const edit = { ...payload, rowVersion: detail.json.rowVersion, keepPhotoSlots: slots,
    photoCaptions: { mh02_new_installed: "Edited development caption" }, remarks: "Edited development notes" };
  const updated = await request("PATCH", `/api/replacements/${formNumber}`, { cookie, body: multipart(edit) });
  assert.equal(updated.status, 200, updated.json?.error?.code);
  assert.notEqual(updated.json.rowVersion, detail.json.rowVersion);
  const stale = await request("PATCH", `/api/replacements/${formNumber}`, { cookie, body: multipart(edit) });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "STALE_VERSION");
  const editedDetail = await request("GET", `/api/replacements/${formNumber}`, { cookie });
  assert.equal(editedDetail.json.remarks, edit.remarks);
  assert.equal(editedDetail.json.photos.find((item) => item.slot === "mh02_new_installed").caption, "Edited development caption");
  const immutable = await request("PATCH", `/api/replacements/${formNumber}`, { cookie,
    body: multipart({ ...edit, rowVersion: updated.json.rowVersion, oldFinalStatus: "in_stock_rfu" }) });
  assert.equal(immutable.status, 422);
  assert.equal(immutable.json.error.code, "HISTORY_FIELDS_IMMUTABLE");

  const removed = await request("DELETE", `/api/replacements/${formNumber}`, { cookie });
  assert.equal(removed.status, 200, removed.json?.error?.code);
  deleted = true;
  const restored = await devices();
  for (const device of [old, replacement]) {
    assert.deepEqual(state(restored.find((item) => item.deviceCode === device.deviceCode)), state(device));
  }
  const missing = await request("GET", `/api/replacements/${formNumber}`, { cookie });
  assert.equal(missing.status, 404);
  console.log("PASS: replacement create, replay, photos, edit, stale version, history guard, delete and state rollback.");
} finally {
  if (formNumber && !deleted) {
    const cleanup = await request("DELETE", `/api/replacements/${formNumber}`, { cookie });
    if (cleanup.status !== 200) console.error(`Fixture cleanup needs review for ${formNumber}; response ${cleanup.status}.`);
  }
}