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
const missingId = "00000000-0000-0000-0000-000000000000";
for (const [method, path] of [
  ["GET", "/api/activity-log"], ["GET", `/api/activity-log/${missingId}`],
  ["POST", "/api/activity-log?activityType=troubleshoot"], ["PATCH", `/api/activity-log/${missingId}`], ["DELETE", `/api/activity-log/${missingId}`],
]) assert.equal((await request(method, path)).status, 401, `${method} ${path} must require authentication.`);
console.log("PASS: Activity Log CRUD routes require authentication.");
if (process.env.ACTIVITY_LOG_TEST_WRITE !== "development-fixture") {
  console.log("SKIP: authenticated CRUD requires ACTIVITY_LOG_TEST_WRITE=development-fixture and MH02_TEST_SESSION.");
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
const master = await request("GET", `/api/devices?siteId=${site.siteId}&q=DEV-TRB-MH02-001`, { cookie });
assert.equal(master.status, 200);
const device = master.json.items.find((item) => item.deviceCode === "DEV-TRB-MH02-001");
assert.equal(device?.status.code, "in_use");

function localTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: site.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
const payload = {
  siteId: site.siteId, deviceCode: device.deviceCode,
  startedAt: localTime(new Date(Date.now() - 10 * 60000)), finishedAt: localTime(new Date(Date.now() - 5 * 60000)),
  componentType: "GPS/Antenna", issue: "Development Activity Log fixture", actionTaken: "Development inspection",
  remarks: "Created through Activity Log", keepPhotoSlots: [],
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==", "base64");
const slots = ["before_repair", "after_repair"];
function multipart(input, photos = false) {
  const form = new FormData();
  form.append("payload", JSON.stringify(input));
  if (photos) for (const slot of slots) form.append(`photo:${slot}`, new Blob([png], { type: "image/png" }), `${slot}.png`);
  return form;
}
const key = randomUUID();
let activityId;
let deleted = false;
try {
  const created = await request("POST", "/api/activity-log?activityType=troubleshoot", { cookie, key, body: multipart(payload, true) });
  assert.equal(created.status, 201, created.json?.error?.code);
  activityId = created.json.activityId;
  const formNumber = created.json.formNumber;
  const replay = await request("POST", "/api/activity-log?activityType=troubleshoot", { cookie, key, body: multipart(payload, true) });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.activityId, activityId);
  assert.equal(replay.headers.get("idempotency-replayed"), "true");
  const detail = await request("GET", `/api/activity-log/${activityId}`, { cookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.formNumber, formNumber);
  assert.equal(detail.json.type, "troubleshoot");
  assert.equal(detail.json.unitNo, device.unit.unitNo);
  assert.equal(detail.json.timeZoneLabel, "WITA");
  assert.equal(detail.json.devices.length, 1);
  assert.equal(detail.json.photos.length, 2);
  assert.equal(detail.json.devices[0].beforeUnit, detail.json.devices[0].afterUnit);
  const listed = await request("GET", `/api/activity-log?activityType=troubleshoot&q=${encodeURIComponent(formNumber)}&siteId=${site.siteId}`, { cookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.total, 1, "A retry must not duplicate the Activity Log.");
  const edit = { ...payload, rowVersion: detail.json.rowVersion, remarks: "Edited through Activity Log", keepPhotoSlots: slots };
  const updated = await request("PATCH", `/api/activity-log/${activityId}`, { cookie, body: multipart(edit) });
  assert.equal(updated.status, 200, updated.json?.error?.code);
  const owner = await request("GET", `/api/troubleshoots/${formNumber}`, { cookie });
  assert.equal(owner.status, 200);
  assert.equal(owner.json.remarks, edit.remarks, "Activity Log and owner must reference the same transaction.");
  const stale = await request("PATCH", `/api/activity-log/${activityId}`, { cookie, body: multipart(edit) });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "STALE_VERSION");
  const removed = await request("DELETE", `/api/activity-log/${activityId}`, { cookie });
  assert.equal(removed.status, 200, removed.json?.error?.code);
  deleted = true;
  assert.equal((await request("GET", `/api/activity-log/${activityId}`, { cookie })).status, 404);
  assert.equal((await request("GET", `/api/troubleshoots/${formNumber}`, { cookie })).status, 404);
  const after = await request("GET", `/api/devices?siteId=${site.siteId}&q=DEV-TRB-MH02-001`, { cookie });
  assert.deepEqual(after.json.items.find((item) => item.deviceCode === device.deviceCode), device);
  console.log("PASS: Activity Log facade create/replay/read/detail/update/stale/delete without duplicate transactions or device changes.");
} finally {
  if (activityId && !deleted) {
    const cleanup = await request("DELETE", `/api/activity-log/${activityId}`, { cookie });
    if (cleanup.status !== 200) console.error(`Fixture cleanup needs review for ${activityId}; response ${cleanup.status}.`);
  }
}