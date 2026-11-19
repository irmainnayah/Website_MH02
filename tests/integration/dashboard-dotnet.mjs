import assert from "node:assert/strict";

const base = new URL(process.env.DOTNET_TEST_URL ?? "http://localhost:5000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Development loopback URL required.");
assert.equal(base.protocol, "http:");
assert.equal(base.username, "");
assert.equal(base.password, "");
async function get(path, cookie) {
  const response = await fetch(new URL(path, base), { headers: cookie ? { cookie: `mh02_session=${cookie}` } : {}, redirect: "manual" });
  return { status: response.status, json: await response.json().catch(() => null) };
}
for (const path of ["/api/dashboard", "/api/dashboard/devices", "/api/dashboard/status-distribution"]) assert.equal((await get(path)).status, 401);
console.log("PASS: Dashboard data requires authentication.");
if (process.env.DASHBOARD_TEST_READ !== "development") {
  console.log("SKIP: authenticated checks require DASHBOARD_TEST_READ=development and MH02_TEST_SESSION.");
  process.exit(0);
}
const cookie = process.env.MH02_TEST_SESSION;
assert.ok(cookie && /^[A-Za-z0-9_=-]+$/.test(cookie), "A valid MH02_TEST_SESSION is required; never commit this token.");
const me = await get("/api/auth/me", cookie);
assert.equal(me.status, 200);
const reference = await get("/api/reference", cookie);
assert.equal(reference.status, 200);
const scopes = [null];
if (me.json.role === "superadmin" && reference.json.sites.length) scopes.push(reference.json.sites[0].siteId);
for (const siteId of scopes) {
  const suffix = siteId === null ? "" : `?siteId=${siteId}`;
  const result = await get(`/api/dashboard${suffix}`, cookie);
  assert.equal(result.status, 200);
  const summary = result.json;
  assert.equal(summary.kpis.officialAssetTotal, null);
  assert.equal(summary.activityGrouping, "stored_start_local_month");
  if (me.json.role === "user") assert.equal(summary.siteId, me.json.siteId);
  const inventory = [];
  for (let page = 1; ; page++) {
    const devices = await get(`/api/dashboard/devices?page=${page}&pageSize=1000${siteId === null ? "" : `&siteId=${siteId}`}`, cookie);
    assert.equal(devices.status, 200);
    inventory.push(...devices.json.items);
    if (page * devices.json.pageSize >= devices.json.total) break;
  }
  assert.equal(new Set(inventory.map((device) => device.internalId)).size, inventory.length);
  assert.equal(summary.kpis.registeredDevices, inventory.length);
  const counts = Object.fromEntries(summary.statusDistribution.map((status) => [status.key, status.count]));
  for (const [status, count] of Object.entries(counts)) assert.equal(count, inventory.filter((device) => device.status === status).length);
  assert.equal(summary.kpis.totalInstalled, counts.in_use ?? 0);
  assert.equal(summary.kpis.hoRepair, counts.in_stock_ho ?? 0);
  assert.equal(summary.kpis.inStock, (counts.in_stock_rfu ?? 0) + (counts.in_stock_damaged ?? 0) + (counts.in_stock_ho ?? 0));
  assert.equal(summary.locationDistribution.reduce((sum, location) => sum + location.total, 0), inventory.length);
  assert.equal(summary.locationDistribution.filter((location) => location.locationSiteId === null).reduce((sum, location) => sum + location.total, 0), inventory.filter((device) => device.currentLocation === null).length);
  assert.equal(summary.equipmentDistribution.reduce((sum, equipment) => sum + equipment.count, 0), inventory.filter((device) => device.status === "in_use").length);
  for (const device of inventory) {
    if (summary.siteId !== null) assert.equal(device.siteId, summary.siteId);
    if (device.lastActivityDate !== null) assert.match(device.lastActivityDate, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(summary.monthlyActivities.length, 6);
  assert.equal(new Set(summary.monthlyActivities.map((month) => month.yearMonth)).size, 6);
  const current = summary.monthlyActivities[5];
  assert.equal(current.yearMonth, summary.currentMonth);
  const [year, month] = summary.currentMonth.split("-").map(Number);
  const lastDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  for (const type of ["installation", "replacement", "removal", "troubleshoot"]) {
    assert.equal(summary.currentMonthActivities[type], current[type]);
    const activities = await get(`/api/activity-log?activityType=${type}&dateFrom=${summary.currentMonth}-01&dateTo=${lastDate}${summary.siteId === null ? "" : `&siteId=${summary.siteId}`}`, cookie);
    assert.equal(activities.status, 200);
    assert.equal(activities.json.total, current[type], `${type} must count activities once, not affected devices or audit rows.`);
  }
  const legacy = await get(`/api/dashboard/status-distribution${suffix}`, cookie);
  assert.equal(legacy.status, 200);
  assert.deepEqual(legacy.json, summary.statusDistribution);
}
assert.equal((await get("/api/dashboard?siteId=0", cookie)).status, 400);
assert.equal((await get("/api/dashboard/devices?pageSize=1001", cookie)).status, 400);
if (me.json.role === "user") assert.equal((await get(`/api/dashboard?siteId=${me.json.siteId === 1 ? 2 : 1}`, cookie)).status, 403);
console.log("PASS: Dashboard aggregates match scoped inventory, activity totals, local-month grouping and status distribution. No data was written.");