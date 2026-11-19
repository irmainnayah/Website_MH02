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
  ["GET", "/api/timeline"], ["GET", "/api/timeline/D001"], ["POST", "/api/timeline/D001?activityType=troubleshoot"],
  ["PATCH", `/api/timeline/D001/activities/${missingId}`], ["DELETE", `/api/timeline/D001/activities/${missingId}`],
  ["PATCH", `/api/timeline/D001/events/${missingId}`], ["DELETE", `/api/timeline/D001/events/${missingId}`],
]) assert.equal((await request(method, path)).status, 401, `${method} ${path} must require authentication.`);
console.log("PASS: timeline reads and writes require authentication.");
if (process.env.TIMELINE_TEST_WRITE !== "development-fixture") {
  console.log("SKIP: authenticated CRUD requires TIMELINE_TEST_WRITE=development-fixture and MH02_TEST_SESSION.");
  process.exit(0);
}
const cookie = process.env.MH02_TEST_SESSION;
assert.ok(cookie && /^[A-Za-z0-9_=-]+$/.test(cookie), "A valid MH02_TEST_SESSION is required; never commit this token.");
const me = await request("GET", "/api/auth/me", { cookie });
assert.equal(me.status, 200);
assert.equal(me.json.role, "superadmin");
const code = "DEV-TRB-MH02-001";
const other = "DEV-TRB-RFU-001";
const path = `/api/timeline/${code}`;
const initial = await request("GET", `${path}?pageSize=1000`, { cookie });
assert.equal(initial.status, 200, "Review and apply 009_troubleshoot_development_seed.sql first.");
assert.equal(initial.json.device.status, "in_use");
const master = initial.json.device;
const registration = initial.json.items.find((entry) => entry.type === "registered");
assert.ok(registration);
for (const method of ["PATCH", "DELETE"]) {
  const blocked = await request(method, `${path}/events/${registration.eventId}`, { cookie });
  assert.equal(blocked.status, 405);
  assert.equal(blocked.json.error.code, "HISTORY_IMMUTABLE");
}
function localTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
const payload = {
  siteId: master.siteId, deviceCode: code, startedAt: localTime(new Date(Date.now() - 10 * 60000)), finishedAt: localTime(new Date(Date.now() - 5 * 60000)),
  componentType: "GPS/Antenna", issue: "Development timeline fixture", actionTaken: "Development inspection", remarks: "Timeline test", keepPhotoSlots: [],
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==", "base64");
const slots = ["before_repair", "after_repair"];
function multipart(input, photos = false) {
  const form = new FormData(); form.append("payload", JSON.stringify(input));
  if (photos) for (const slot of slots) form.append(`photo:${slot}`, new Blob([png], { type: "image/png" }), `${slot}.png`);
  return form;
}
let activityId;
let deleted = false;
const key = randomUUID();
try {
  const mismatch = await request("POST", `/api/timeline/${other}?activityType=troubleshoot`, { cookie, key, body: multipart(payload, true) });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.json.error.code, "DEVICE_MISMATCH");
  const created = await request("POST", `${path}?activityType=troubleshoot`, { cookie, key, body: multipart(payload, true) });
  assert.equal(created.status, 201, created.json?.error?.code);
  activityId = created.json.activityId;
  const replay = await request("POST", `${path}?activityType=troubleshoot`, { cookie, key, body: multipart(payload, true) });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.activityId, activityId);
  const afterCreate = await request("GET", `${path}?pageSize=1000`, { cookie });
  assert.equal(afterCreate.json.items.filter((entry) => entry.activityId === activityId && entry.entryType === "activity").length, 1);
  assert.equal(afterCreate.json.items.find((entry) => entry.activityId === activityId).role, "subject");
  const wrongDelete = await request("DELETE", `/api/timeline/${other}/activities/${activityId}`, { cookie });
  assert.equal(wrongDelete.status, 404);
  const detail = await request("GET", `/api/activity-log/${activityId}`, { cookie });
  assert.equal(detail.status, 200);
  const edit = { ...payload, rowVersion: detail.json.rowVersion, remarks: "Edited through Timeline", keepPhotoSlots: slots };
  const updated = await request("PATCH", `${path}/activities/${activityId}`, { cookie, body: multipart(edit) });
  assert.equal(updated.status, 200, updated.json?.error?.code);
  assert.equal((await request("GET", `/api/troubleshoots/${created.json.formNumber}`, { cookie })).json.remarks, edit.remarks);
  const stale = await request("PATCH", `${path}/activities/${activityId}`, { cookie, body: multipart(edit) });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.error.code, "STALE_VERSION");
  const removed = await request("DELETE", `${path}/activities/${activityId}`, { cookie });
  assert.equal(removed.status, 200, removed.json?.error?.code);
  deleted = true;
  const final = await request("GET", `${path}?pageSize=1000`, { cookie });
  assert.deepEqual(final.json.device, master);
  assert.equal(final.json.items.filter((entry) => entry.activityId === activityId).length, 0);
  const deletionEvents = final.json.items.filter((entry) => entry.type === "transaction_deleted" && entry.sourceActivityId === activityId);
  assert.equal(deletionEvents.length, 1, "Deleted activities must become exactly one event per affected Device.");
  assert.equal(deletionEvents[0].formNumber, created.json.formNumber);
  assert.equal(deletionEvents[0].detailPath, null);
  assert.equal(new Set(final.json.items.map((entry) => entry.key)).size, final.json.items.length);
  assert.equal(final.json.items.filter((entry) => entry.key === registration.key).length, 1);
  console.log("PASS: device-bound timeline CRUD, replay, stale version, immutable events and retained deletion history.");
} finally {
  if (activityId && !deleted) {
    const cleanup = await request("DELETE", `${path}/activities/${activityId}`, { cookie });
    if (cleanup.status !== 200) console.error(`Fixture cleanup needs review for ${activityId}; response ${cleanup.status}.`);
  }
}