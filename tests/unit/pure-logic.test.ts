// Unit tests for the database-independent backend logic. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../../src/server/errors.ts";
import {
  durationMinutes,
  formatWithOffset,
  isAllowedZone,
  localDate,
  localToUtc,
  localYearMonth,
  offsetMinutesAt,
  parseLocalDateTime,
  zoneLabel,
} from "../../src/server/time.ts";
import { buildScope, readSiteFilter, writeSiteId, canAccessSite } from "../../src/server/scope.ts";
import type { AuthUser } from "../../src/server/scope.ts";
import {
  STATUS,
  checkArchivable,
  matchesAfterSnapshot,
  planInstallation,
  planOverride,
  planRemoval,
  planReplacement,
  planTroubleshoot,
} from "../../src/server/transitions.ts";
import type { DeviceFacts, UnitFacts } from "../../src/server/transitions.ts";
import { formatFormNumber } from "../../src/server/formNumber.ts";
import { canonicalJson, requestHash, sha256Hex } from "../../src/server/hash.ts";

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return `${e.status}:${e.code}`;
    throw e;
  }
  return "no error";
}

/* ------------------------------------------------------------------ time */

test("WITA is UTC+8 and an overnight job has a correct duration", () => {
  const start = localToUtc(parseLocalDateTime("2026-10-20T22:30"), "Asia/Makassar");
  const end = localToUtc(parseLocalDateTime("2026-10-21T02:15"), "Asia/Makassar");
  assert.equal(start.offsetMinutes, 480);
  assert.equal(new Date(start.utcMs).toISOString(), "2026-10-20T14:30:00.000Z");
  assert.equal(durationMinutes(start.utcMs, end.utcMs), 3 * 60 + 45);
});

test("a multi-day job keeps its duration", () => {
  const a = localToUtc(parseLocalDateTime("2026-10-20T08:00"), "Asia/Jakarta");
  const b = localToUtc(parseLocalDateTime("2026-10-22T09:30"), "Asia/Jakarta");
  assert.equal(durationMinutes(a.utcMs, b.utcMs), 2 * 24 * 60 + 90);
});

test("the offset depends on the Site zone, never on the client", () => {
  assert.equal(localToUtc(parseLocalDateTime("2026-10-20T10:00"), "Asia/Jakarta").offsetMinutes, 420);
  assert.equal(localToUtc(parseLocalDateTime("2026-10-20T10:00"), "Asia/Makassar").offsetMinutes, 480);
  assert.equal(localToUtc(parseLocalDateTime("2026-10-20T10:00"), "Asia/Jayapura").offsetMinutes, 540);
  assert.equal(zoneLabel("Asia/Jayapura"), "WIT");
});

test("strings with Z or an offset are rejected", () => {
  assert.equal(code(() => parseLocalDateTime("2026-10-20T22:30Z")), "400:OFFSET_NOT_ALLOWED");
  assert.equal(code(() => parseLocalDateTime("2026-10-20T22:30+08:00")), "400:OFFSET_NOT_ALLOWED");
  assert.equal(code(() => parseLocalDateTime("2026-10-20 22:30")), "400:INVALID_DATETIME");
  assert.equal(code(() => parseLocalDateTime("2026-02-30T10:00")), "400:INVALID_DATETIME");
  assert.equal(code(() => parseLocalDateTime("2026-13-01T10:00")), "400:INVALID_DATETIME");
});

test("only the configured Indonesian zones are accepted", () => {
  assert.equal(isAllowedZone("Asia/Makassar"), true);
  assert.equal(isAllowedZone("America/New_York"), false);
  assert.equal(code(() => localToUtc(parseLocalDateTime("2026-10-20T10:00"), "America/New_York")), "422:UNSUPPORTED_ZONE");
});

test("the offset resolver follows DST for zones that have it (design stays future-proof)", () => {
  assert.equal(offsetMinutesAt(Date.UTC(2026, 0, 15, 12), "America/New_York"), -300);
  assert.equal(offsetMinutesAt(Date.UTC(2026, 6, 15, 12), "America/New_York"), -240);
});

test("local formatting and local month use the snapshotted offset", () => {
  const t = localToUtc(parseLocalDateTime("2026-10-31T23:30"), "Asia/Makassar");
  assert.equal(formatWithOffset(t.utcMs, t.offsetMinutes), "2026-10-31T23:30:00+08:00");
  assert.equal(localDate(t.utcMs, t.offsetMinutes), "2026-10-31");
  assert.equal(localYearMonth(t.utcMs, t.offsetMinutes), "202610");
  // 16:30 UTC on 31 Oct is already 1 Nov in WITA? No: 23:30 local stays in October; 00:30 on 1 Nov local:
  const n = localToUtc(parseLocalDateTime("2026-11-01T00:30"), "Asia/Makassar");
  assert.equal(localYearMonth(n.utcMs, n.offsetMinutes), "202611");
});

/* ----------------------------------------------------------------- scope */

const tech = (siteId: number | null): AuthUser => ({ userId: "u1", nrp: "N1", name: "T", role: "user", siteId });
const admin: AuthUser = { userId: "a1", nrp: "A1", name: "A", role: "superadmin", siteId: null };

test("a regular user is always restricted to their own Site", () => {
  assert.deepEqual(buildScope(tech(3)), { all: false, siteId: 3 });
  assert.equal(readSiteFilter(tech(3)), 3);
  assert.equal(readSiteFilter(tech(3), 3), 3);
  assert.equal(code(() => readSiteFilter(tech(3), 4)), "403:SITE_FORBIDDEN");
  assert.equal(code(() => buildScope(tech(null))), "403:NO_SITE_ASSIGNED");
});

test("a client-supplied siteId can never widen a user's write scope", () => {
  assert.equal(writeSiteId(tech(3)), 3);
  assert.equal(writeSiteId(tech(3), 3), 3);
  assert.equal(code(() => writeSiteId(tech(3), 9)), "403:SITE_FORBIDDEN");
});

test("a Super Admin sees all Sites, may filter, and must choose a Site to write", () => {
  assert.deepEqual(buildScope(admin), { all: true });
  assert.equal(readSiteFilter(admin), null);
  assert.equal(readSiteFilter(admin, 2), 2);
  assert.equal(writeSiteId(admin, 2), 2);
  assert.equal(code(() => writeSiteId(admin)), "400:SITE_REQUIRED");
  assert.equal(canAccessSite({ all: true }, 99), true);
  assert.equal(canAccessSite({ all: false, siteId: 1 }, 2), false);
});

/* ----------------------------------------------------------- transitions */

const device = (over: Partial<DeviceFacts> = {}): DeviceFacts => ({
  deviceId: "d1",
  deviceCode: "D001",
  siteId: 1,
  isDeleted: false,
  statusId: STATUS.in_stock_rfu,
  unitId: null,
  locationSiteId: 1,
  lastMaintenanceDate: null,
  ...over,
});
const unit = (over: Partial<UnitFacts> = {}): UnitFacts => ({
  unitId: "u1",
  unitNo: "DT-101",
  siteId: 1,
  isActive: true,
  occupiedByDeviceId: null,
  ...over,
});

test("installation: In Stock RFU -> In Use on a free Unit of the same Site", () => {
  const plan = planInstallation(device(), unit(), 1, "2026-10-20");
  assert.equal(plan.after.statusId, STATUS.in_use);
  assert.equal(plan.after.unitId, "u1");
  assert.equal(plan.after.lastMaintenanceDate, "2026-10-20");
  assert.equal(plan.before.statusId, STATUS.in_stock_rfu);
});

test("installation rules: status, Site, archive and Unit checks", () => {
  assert.equal(code(() => planInstallation(device({ statusId: STATUS.in_use, unitId: "u9" }), unit(), 1, "d")), "422:DEVICE_NOT_AVAILABLE");
  assert.equal(code(() => planInstallation(device({ siteId: 2 }), unit(), 1, "d")), "422:DEVICE_SITE_MISMATCH");
  assert.equal(code(() => planInstallation(device({ isDeleted: true }), unit(), 1, "d")), "422:DEVICE_ARCHIVED");
  assert.equal(code(() => planInstallation(device(), unit({ siteId: 2 }), 1, "d")), "422:UNIT_SITE_MISMATCH");
  assert.equal(code(() => planInstallation(device(), unit({ occupiedByDeviceId: "other" }), 1, "d")), "422:UNIT_OCCUPIED");
  assert.equal(code(() => planInstallation(device(), null, 1, "d")), "422:UNIT_NOT_FOUND");
});

test("removal maps the three final conditions and keeps the location (Q5)", () => {
  const inUse = device({ statusId: STATUS.in_use, unitId: "u1", locationSiteId: 1 });
  assert.equal(planRemoval(inUse, unit(), 1, "in_stock_rfu", "2026-10-21").after.statusId, STATUS.in_stock_rfu);
  assert.equal(planRemoval(inUse, unit(), 1, "in_stock_damaged", "2026-10-21").after.statusId, STATUS.in_stock_damaged);
  const ho = planRemoval(inUse, unit(), 1, "in_stock_ho", "2026-10-21");
  assert.equal(ho.after.statusId, STATUS.in_stock_ho);
  assert.equal(ho.after.unitId, null);
  assert.equal(ho.after.locationSiteId, 1);
  assert.equal(code(() => planRemoval(device(), unit(), 1, "in_stock_rfu", "d")), "422:DEVICE_NOT_IN_USE");
  assert.equal(code(() => planRemoval(inUse, unit({ unitId: "other" }), 1, "in_stock_rfu", "d")), "422:UNIT_MISMATCH");
});

test("replacement: the old device leaves, the new one takes the SAME Unit", () => {
  const oldD = device({ deviceId: "old", deviceCode: "D-OLD", statusId: STATUS.in_use, unitId: "u1" });
  const newD = device({ deviceId: "new", deviceCode: "D-NEW" });
  const occupied = unit({ occupiedByDeviceId: "old" });
  const plan = planReplacement(oldD, newD, occupied, 1, "in_stock_damaged", "2026-10-22");
  assert.equal(plan.old.after.statusId, STATUS.in_stock_damaged);
  assert.equal(plan.old.after.unitId, null);
  assert.equal(plan.new.after.statusId, STATUS.in_use);
  assert.equal(plan.new.after.unitId, "u1");
  assert.equal(code(() => planReplacement(oldD, oldD, occupied, 1, "in_stock_rfu", "d")), "422:SAME_DEVICE");
  assert.equal(code(() => planReplacement(oldD, device({ deviceId: "n2", siteId: 2 }), occupied, 1, "in_stock_rfu", "d")), "422:DEVICE_SITE_MISMATCH");
});

test("troubleshoot never changes the device", () => {
  const d = device({ statusId: STATUS.in_use, unitId: "u1" });
  const plan = planTroubleshoot(d, 1);
  assert.deepEqual(plan.before, plan.after);
  assert.equal(code(() => planTroubleshoot(d, 2)), "422:DEVICE_SITE_MISMATCH");
});

test("override keeps In Use <=> has a Unit, and never touches location or last maintenance", () => {
  const rfu = device({ lastMaintenanceDate: "2026-01-01" });
  const toUse = planOverride(rfu, { statusId: STATUS.in_use, unitId: "u1" }, unit());
  assert.equal(toUse.after.unitId, "u1");
  assert.equal(toUse.after.locationSiteId, rfu.locationSiteId);
  assert.equal(toUse.after.lastMaintenanceDate, "2026-01-01");
  assert.equal(code(() => planOverride(rfu, { statusId: STATUS.in_use, unitId: null }, null)), "422:UNIT_REQUIRED");
  assert.equal(code(() => planOverride(rfu, { statusId: STATUS.in_stock_ho, unitId: "u1" }, unit())), "422:UNIT_NOT_ALLOWED");
  assert.equal(code(() => planOverride(rfu, { statusId: STATUS.in_use, unitId: "u1" }, unit({ occupiedByDeviceId: "x" }))), "422:UNIT_OCCUPIED");
  assert.equal(code(() => planOverride(rfu, { statusId: STATUS.in_use, unitId: "u1" }, unit({ siteId: 2 }))), "422:UNIT_SITE_MISMATCH");
  assert.equal(code(() => planOverride(rfu, { statusId: STATUS.in_stock_rfu, unitId: null }, null)), "422:OVERRIDE_NO_CHANGE");
  assert.equal(code(() => planOverride(device({ isDeleted: true }), { statusId: 3, unitId: null }, null)), "422:DEVICE_ARCHIVED");
  const out = planOverride(device({ statusId: STATUS.in_use, unitId: "u1" }), { statusId: STATUS.in_stock_damaged, unitId: null }, null);
  assert.equal(out.after.unitId, null);
});

test("archive is refused while In Use or when already archived", () => {
  assert.equal(code(() => checkArchivable(device({ statusId: STATUS.in_use, unitId: "u1" }))), "409:DEVICE_IN_USE");
  assert.equal(code(() => checkArchivable(device({ isDeleted: true }))), "409:DEVICE_ALREADY_ARCHIVED");
  assert.equal(code(() => checkArchivable(device())), "no error");
});

test("check 0: the device must still equal the activity's after-snapshot", () => {
  const after = { statusId: 1, unitId: "u1", locationSiteId: 1, lastMaintenanceDate: "2026-10-20" };
  assert.equal(matchesAfterSnapshot({ ...after }, after), true);
  assert.equal(matchesAfterSnapshot({ ...after, statusId: 2, unitId: null }, after), false);
});

/* ----------------------------------------------------------- form number */

test("form numbers follow PREFIX-YYYYMM-NNN", () => {
  assert.equal(formatFormNumber("installation", "202610", 1), "INS-202610-001");
  assert.equal(formatFormNumber("replacement", "202611", 42), "REP-202611-042");
  assert.equal(formatFormNumber("removal", "202610", 1000), "REM-202610-1000");
  assert.equal(formatFormNumber("troubleshoot", "202610", 7), "TRB-202610-007");
  assert.throws(() => formatFormNumber("removal", "2026-10", 1));
  assert.throws(() => formatFormNumber("removal", "202610", 0));
});

/* ------------------------------------------------------------------ hash */

test("the request hash ignores key order but detects any change", () => {
  const a = { b: 1, a: { y: 2, x: [1, 2] } };
  const b = { a: { x: [1, 2], y: 2 }, b: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(requestHash("installations", 3, a), requestHash("installations", 3, b));
  assert.notEqual(requestHash("installations", 3, a), requestHash("removals", 3, a));
  assert.notEqual(requestHash("installations", 3, a), requestHash("installations", 4, a));
  assert.notEqual(requestHash("installations", 3, a), requestHash("installations", 3, { ...a, b: 2 }));
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
