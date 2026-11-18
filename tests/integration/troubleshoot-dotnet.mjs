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
  ["GET", "/api/troubleshoots"], ["GET", "/api/troubleshoots/TRB-200001-999"],
  ["POST", "/api/troubleshoots"], ["PATCH", "/api/troubleshoots/TRB-200001-999"], ["DELETE", "/api/troubleshoots/TRB-200001-999"],
]) assert.equal((await request(method, path)).status, 401, `${method} ${path} must require authentication.`);
console.log("PASS: troubleshoot CRUD routes require authentication.");
if (process.env.TROUBLESHOOT_TEST_WRITE !== "development-fixture") {
  console.log("SKIP: authenticated CRUD requires TROUBLESHOOT_TEST_WRITE=development-fixture and MH02_TEST_SESSION.");
  process.exit(0);
}
const cookie = process.env.MH02_TEST_SESSION;
assert.ok(cookie && /^[A-Za-z0-9_=-]+$/.test(cookie), "A valid MH02_TEST_SESSION is required; never commit this token.");
const me = await request("GET", "/api/auth/me", { cookie });
assert.equal(me.status, 200);
assert.equal(me.json.role, "superadmin");
const reference = await request("GET", "/api/reference", { cookie });
assert.equal(reference.status, 200);
const site = reference.json.sites.find((item) => item.siteCode === "DEV-TROUBLESHOOT");
assert.ok(site, "Review and apply 009_troubleshoot_development_seed.sql first.");
async function devices() {
  const result = await request("GET", `/api/devices?siteId=${site.siteId}&q=DEV-TRB-&pageSize=100`, { cookie });
  assert.equal(result.status, 200);
  return result.json.items.sort((left, right) => left.deviceCode.localeCompare(right.deviceCode));
}
function localTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: site.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
const before = await devices();
const installed = before.find((item) => item.deviceCode === "DEV-TRB-MH02-001");
const stock = before.find((item) => item.deviceCode === "DEV-TRB-RFU-001");
assert.equal(installed?.status.code, "in_use");
assert.equal(stock?.status.code, "in_stock_rfu");
const payload = {
  siteId: site.siteId, deviceCode: installed.deviceCode,
  startedAt: localTime(new Date(Date.now() - 10 * 60000)), finishedAt: localTime(new Date(Date.now() - 5 * 60000)),
  componentType: "GPS/Antenna", issue: "Development GPS fixture", actionTaken: "Development connector inspection",
  healthCheckStatus: "Pending", remarks: "Development troubleshoot CRUD test", keepPhotoSlots: [],
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
const slots = ["before_repair", "after_repair"];
const key = randomUUID();
let formNumber;
let deleted = false;
try {
  const missing = await request("POST", "/api/troubleshoots", { cookie, key, body: multipart(payload) });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error.code, "PHOTO_REQUIRED");
  const stockCreate = await request("POST", "/api/troubleshoots", { cookie, key: randomUUID(), body: multipart({ ...payload, deviceCode: stock.deviceCode }, slots) });
  assert.equal(stockCreate.status, 422);
  assert.equal(stockCreate.json.error.code, "DEVICE_NOT_INSTALLED");
  assert.deepEqual(await devices(), before, "Rejecting a stock Device must not change Device master.");
  const created = await request("POST", "/api/troubleshoots", { cookie, key, body: multipart(payload, slots) });
  assert.equal(created.status, 201, created.json?.error?.code);
  formNumber = created.json.formNumber;
  assert.match(formNumber, /^TRB-\d{6}-\d{3,}$/);
  assert.deepEqual(await devices(), before, "Create must not modify any Device field, including rowVersion and health check.");
  const replay = await request("POST", "/api/troubleshoots", { cookie, key, body: multipart(payload, slots) });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.formNumber, formNumber);
  assert.equal(replay.headers.get("idempotency-replayed"), "true");
  const reused = await request("POST", "/api/troubleshoots", { cookie, key, body: multipart({ ...payload, issue: "Different issue" }, slots) });
  assert.equal(reused.status, 422);
  assert.equal(reused.json.error.code, "IDEMPOTENCY_KEY_REUSED");
  const detail = await request("GET", `/api/troubleshoots/${formNumber}`, { cookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.unitNo, installed.unit.unitNo);
  const photo = await fetch(new URL(detail.json.photos.beforeRepair.replace(/^\/api\/dotnet\//, "/api/"), base), { headers: { cookie: `mh02_session=${cookie}` } });
  assert.equal(photo.status, 200);
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
  const edit = { ...payload, rowVersion: detail.json.rowVersion,
    startedAt: localTime(new Date(Date.now() - 9 * 60000)), finishedAt: localTime(new Date(Date.now() - 4 * 60000)),
    healthCheckStatus: "Verified", remarks: "Edited development notes", keepPhotoSlots: ["before_repair"],
    photoCaptions: { before_repair: "Edited caption" } };
  const stockEdit = await request("PATCH", `/api/troubleshoots/${formNumber}`, { cookie, body: multipart({ ...edit, deviceCode: stock.deviceCode }, ["after_repair"]) });
  assert.equal(stockEdit.status, 422);
  assert.equal(stockEdit.json.error.code, "DEVICE_NOT_INSTALLED");
  assert.equal((await request("GET", `/api/troubleshoots/${formNumber}`, { cookie })).json.rowVersion, detail.json.rowVersion);
  const updated = await request("PATCH", `/api/troubleshoots/${formNumber}`, { cookie, body: multipart(edit, ["after_repair"]) });
  assert.equal(updated.status, 200, updated.json?.error?.code);
  assert.notEqual(updated.json.rowVersion, detail.json.rowVersion);
  assert.deepEqual(await devices(), before, "Update must not modify Device master.");
  const stale = await request("PATCH", `/api/troubleshoots/${formNumber}`, { cookie, body: multipart(edit, ["after_repair"]) });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "STALE_VERSION");
  const edited = await request("GET", `/api/troubleshoots/${formNumber}`, { cookie });
  assert.equal(edited.json.deviceId, installed.deviceCode);
  assert.equal(edited.json.unitNo, installed.unit.unitNo);
  assert.equal(edited.json.fleetEquipmentType, installed.unit.equipmentType);
  assert.equal(edited.json.egi, installed.unit.egi);
  assert.equal(edited.json.startTime, edit.startedAt);
  assert.equal(edited.json.healthCheckStatus, "Verified");
  assert.equal(edited.json.photoCaptions.beforeRepair, "Edited caption");
  assert.notEqual(edited.json.photos.afterRepair, detail.json.photos.afterRepair);
  const future = await request("PATCH", `/api/troubleshoots/${formNumber}`, { cookie, body: multipart({ ...edit,
    rowVersion: updated.json.rowVersion, keepPhotoSlots: slots, finishedAt: localTime(new Date(Date.now() + 10 * 60000)),
  }) });
  assert.equal(future.status, 422);
  assert.equal(future.json.error.code, "INVALID_DATETIME");
  assert.deepEqual(await devices(), before);
  const removed = await request("DELETE", `/api/troubleshoots/${formNumber}`, { cookie });
  assert.equal(removed.status, 200, removed.json?.error?.code);
  deleted = true;
  assert.deepEqual(await devices(), before, "Delete must not modify Device master.");
  assert.equal((await request("GET", `/api/troubleshoots/${formNumber}`, { cookie })).status, 404);
  console.log("PASS: troubleshoot CRUD, installed Unit data, stock Device rejection, photos, stale version and unchanged master.");
} finally {
  if (formNumber && !deleted) {
    const cleanup = await request("DELETE", `/api/troubleshoots/${formNumber}`, { cookie });
    if (cleanup.status !== 200) console.error(`Fixture cleanup needs review for ${formNumber}; response ${cleanup.status}.`);
  }
}