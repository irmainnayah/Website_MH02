// Contract tests between service code and the migrations (no database needed). They catch a service writing a
// value that a CHECK constraint forbids, the exact class of bug behind the 422 CONSTRAINT_VIOLATION on POST /devices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { constraintNameFromMessage } from "../../src/server/errors.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("Dashboard aggregates scoped nonarchived devices and stored local activity months without mock or speculative asset totals", () => {
  const code = read("backend-dotnet/DashboardData.cs");
  assert.match(code, /SessionStore\.TryScope/);
  assert.match(code, /IsolationLevel\.RepeatableRead/);
  assert.match(code, /NOT d\.is_deleted AND \(@site IS NULL OR d\.site_id = @site\)/);
  assert.match(code, /d\.current_location_site_id/);
  assert.match(code, /COALESCE\(ls\.name, 'Belum tercatat'\)/);
  assert.match(code, /make_interval\(mins => a\.start_utc_offset_minutes\)/);
  assert.match(code, /generate_series/);
  assert.match(code, /a\.activity_type, count\(\*\) AS total FROM activities a/);
  assert.match(code, /officialAssetTotal = \(long\?\)null/);
  assert.match(code, /lastActivityDate = Date\(reader, 14\)/);
  assert.doesNotMatch(code, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(?:devices|activities)\b/i);
  for (const component of ["KpiGrid.tsx", "MonthlyActivitySummary.tsx", "DashboardHeader.tsx", "charts/DeviceStatusChart.tsx", "charts/DeviceLocationChart.tsx", "charts/ActivityBarChart.tsx", "charts/EquipmentTypeChart.tsx", "DeviceList/index.tsx", "DeviceList/DeviceDetailModal.tsx"]) {
    assert.doesNotMatch(read(`src/components/dashboard/${component}`), /mock-data/, `${component} must use API data`);
  }
  assert.match(read("src/app/page.tsx"), /DashboardDataProvider/);
});

test("PostgreSQL audit endpoints preserve append-only history, Site scope and secret redaction", () => {
  const service = read("backend-dotnet/AuditLogEndpoints.cs");
  assert.doesNotMatch(service, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?audit_log\b/i);
  assert.match(service, /AUDIT_APPEND_ONLY/);
  assert.match(service, /Error\(405,/);
  assert.match(service, /@site IS NULL OR l\.site_id = @site/);
  assert.match(service, /@site IS NULL OR site_id = @site/);
  assert.match(service, /SessionStore\.TryScope/);
  assert.match(service, /reader\.GetInt64\(0\)\.ToString/);
  assert.match(service, /Redact\(JsonNode\.Parse/);
  assert.match(service, /obj\.Remove\(key\)/);
  assert.match(service, /foreach \(var child in array\) Redact\(child\)/);
  assert.match(service, /a\.activity_id = l\.entity_id/);
  assert.match(service, /occurred_at >= \(@from::date::timestamp AT TIME ZONE 'UTC'\)/);
  const schema = read("database/postgresql/001_initial_schema.sql");
  assert.match(schema, /audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log/);
  const page = read("src/app/reports/audit-logs/page.tsx");
  assert.doesNotMatch(page, /mock-data|useSyncExternalStore/);
});

test("Timeline uses only live activity links and append-only device events with device-bound writes", () => {
  const reads = read("backend-dotnet/TimelineEndpoints.cs");
  assert.match(reads, /FROM activity_devices ad JOIN activities a/);
  assert.match(reads, /FROM device_events e/);
  assert.match(reads, /UNION ALL/);
  assert.match(reads, /'A:' \|\| a\.activity_id::text \|\| ':' \|\| ad\.device_id::text/);
  assert.match(reads, /'E:' \|\| e\.event_id::text/);
  assert.match(reads, /ORDER BY sort_time DESC, created_time DESC, entry_key DESC/);
  assert.doesNotMatch(reads, /FROM audit_log|JOIN audit_log/i);
  assert.match(reads, /@admin OR NOT d\.is_deleted/);
  assert.match(reads, /ad\.device_id = @device AND a\.site_id = @owner_site/);
  const writes = read("backend-dotnet/TimelineWrites.cs");
  assert.match(writes, /ActivityLogWrites\.DispatchAsync/);
  assert.match(writes, /HISTORY_IMMUTABLE/);
  assert.match(writes, /DEVICE_MISMATCH/);
  assert.match(writes, /ad\.device_id = @device AND a\.activity_id = @id/);
  assert.doesNotMatch(writes, /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(?:public\.)?(?:device_events|activities|devices)\b/i);
  for (const page of ["src/app/reports/timeline/page.tsx", "src/app/reports/timeline/[id]/page.tsx"]) assert.doesNotMatch(read(page), /mock-data|useSyncExternalStore/);
});

test("Activity Log writes delegate to the original transaction handlers without duplicating persistence", () => {
  const code = read("backend-dotnet/ActivityLogWrites.cs");
  for (const handler of ["InstallationWrites.HandleAsync", "InstallationUpdates.HandleAsync", "InstallationDeletes.HandleAsync",
    "ReplacementWrites.CreateAsync", "ReplacementWrites.UpdateAsync", "ReplacementWrites.DeleteAsync", "RemovalWrites.WriteAsync", "TroubleshootWrites.WriteAsync"]) {
    assert.ok(code.includes(handler), `Activity Log must use ${handler}`);
  }
  assert.doesNotMatch(code, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(?:activities|activity_devices|devices|audit_log)\b/i);
  assert.match(code, /SessionStore\.TryScope/);
  const reads = read("backend-dotnet/ActivityLogEndpoints.cs");
  for (const table of ["installation_details", "replacement_details", "removal_details", "troubleshoot_details", "activity_devices", "transaction_photos"]) assert.ok(reads.includes(table));
  assert.doesNotMatch(reads, /WHERE[^;]*?d\.is_deleted\s*=\s*(?:false|FALSE)/);
  assert.match(reads, /start_utc_offset_minutes/);
  const page = read("src/app/reports/activity-log/page.tsx");
  assert.doesNotMatch(page, /mock-data|deviceUnitMap|useSyncExternalStore/);
});

function allowedValues(migration: string, constraint: string): string[] {
  const re = new RegExp(`CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(([\\s\\S]*?)\\)\\s*[,)]`, "i");
  const m = re.exec(migration);
  assert.ok(m, `constraint ${constraint} not found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test("PostgreSQL removal later-activity guard follows start/create ordering, not finish time", () => {
  const service = read("backend-dotnet/RemovalWrites.cs");
  const guard = /private static async Task CheckLatestAsync\([\s\S]*?(?=private static async Task SetDeviceAsync)/.exec(service)?.[0];
  assert.ok(guard, "Removal history guard must be present");
  assert.match(guard, /a\.started_at > @start/);
  assert.match(guard, /a\.started_at = @start AND a\.created_at > @created/);
  assert.doesNotMatch(guard, /a\.finished_at/);
  assert.match(guard, /SELECT a\.form_number, a\.started_at, a\.start_utc_offset_minutes, a\.time_zone_id/);
  assert.match(guard, /LATER_ACTIVITY_EXISTS/);
  assert.match(guard, /reader\.GetString\(0\)/);
});

test("PostgreSQL troubleshooting preserves device master and follows documented history ordering", () => {
  const service = read("backend-dotnet/TroubleshootWrites.cs");
  assert.doesNotMatch(service, /\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?devices\b/i);
  assert.match(service, /@status, @status, @unit, @unit, @location, @location, @maintenance, @maintenance/);
  assert.match(service, /before == ReadState\(reader, 12\)/);
  assert.match(service, /a\.started_at > @start OR \(a\.started_at = @start AND a\.created_at > @created\)/);
  assert.doesNotMatch(service, /a\.finished_at > @start/);
  assert.match(service, /device\.Current\.Status == 1 && device\.Current\.Unit is not null/);
  assert.match(service, /DEVICE_NOT_INSTALLED/);
  const form = read("src/app/support/troubleshoots/new/page.tsx");
  assert.match(form, /device\.status === "in_use" && Boolean\(device\.unitNo\?\.trim\(\)\)/);
  assert.match(form, /device\.deviceId === editingRecord\?\.deviceId/);
  assert.match(form, /fleetEquipmentType: preserveSnapshot \? originalRecord\?\.fleetEquipmentType : selectedDevice\?\.equipmentType/);
  const components = /Components = \[([^\]]+)\]/.exec(read("backend-dotnet/TroubleshootEndpoints.cs"));
  const constraint = /component_type varchar\(20\) CHECK \(component_type IN \(([^)]+)\)\)/.exec(read("database/postgresql/001_initial_schema.sql"));
  assert.ok(components && constraint);
  const declared = [...components[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
  const allowed = [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(declared, allowed);
});

test("constraint names are extracted from SQL Server messages (names only, never values)", () => {
  assert.equal(
    constraintNameFromMessage('The INSERT statement conflicted with the CHECK constraint "CK_devices_data_source". The conflict occurred in database "db", table "dbo.devices", column \'data_source\'.'),
    "CK_devices_data_source"
  );
  assert.equal(constraintNameFromMessage("Violation of UNIQUE KEY constraint 'UQ_devices_device_code'. Cannot insert duplicate key in object 'dbo.devices'. The duplicate key value is (D001)."), "UQ_devices_device_code");
  assert.equal(constraintNameFromMessage("Cannot insert duplicate key row in object 'dbo.devices' with unique index 'UX_devices_serial_number'. The duplicate key value is (SN001)."), "UX_devices_serial_number");
  assert.equal(constraintNameFromMessage("something else"), null);
});

test("devices.data_source written by the service is allowed by CK_devices_data_source", () => {
  const allowed = allowedValues(read("database/migrations/V002__devices_fleet.sql"), "CK_devices_data_source");
  assert.deepEqual([...allowed].sort(), ["dev_seed", "import", "manual"]);
  const service = read("src/server/devices.ts");
  const insert = /INSERT INTO dbo\.devices[\s\S]*?VALUES\s*\(([^)]*)\)/.exec(service);
  assert.ok(insert, "INSERT INTO dbo.devices not found in devices.ts");
  const literals = [...insert[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.ok(literals.some((l) => allowed.includes(l)), `devices.ts writes ${JSON.stringify(literals)}, none allowed by the CHECK (${allowed.join(", ")})`);
  assert.ok(!literals.includes("app"), "'app' is valid for users.data_source only");
});

test("users.data_source allows 'app' (the value is valid for users, not for devices)", () => {
  assert.ok(allowedValues(read("database/migrations/V001__core_reference.sql"), "CK_users_data_source").includes("app"));
});

test("audit actions and tables written by the services exist in the audit_log CHECKs", () => {
  const migration = read("database/migrations/V005__audit_log.sql");
  const actions = allowedValues(migration, "CK_audit_log_action");
  const tables = allowedValues(migration, "CK_audit_log_table_name");
  const code = ["src/server/devices.ts", "src/server/transactions.ts", "src/server/users.ts"].map(read).join("\n");
  for (const m of code.matchAll(/action:\s*"([a-z_]+)"/g)) {
    assert.ok(actions.includes(m[1]), `audit action ${m[1]} is not allowed by CK_audit_log_action`);
  }
  for (const m of code.matchAll(/tableName:\s*"([a-z_]+)"/g)) {
    assert.ok(tables.includes(m[1]), `audit table ${m[1]} is not allowed by CK_audit_log_table_name`);
  }
});

test("device event types written by the services exist in CK_device_events_event_type", () => {
  const types = allowedValues(read("database/migrations/V006__device_events.sql"), "CK_device_events_event_type");
  const code = ["src/server/devices.ts", "src/server/transactions.ts", "src/server/users.ts"].map(read).join("\n");
  for (const m of code.matchAll(/type:\s*"(registered|details_updated|soft_deleted|transaction_deleted|device_override)"/g)) {
    assert.ok(types.includes(m[1]), `event type ${m[1]} is not allowed`);
  }
});

test("component types, shifts and final statuses accepted by validators exist in the migrations", () => {
  const v3 = read("database/migrations/V003__activities.sql");
  const components = allowedValues(v3, "CK_troubleshoot_details_component_type");
  const validators = read("src/server/validators.ts");
  const list = /COMPONENTS = \[([^\]]+)\]/.exec(validators);
  assert.ok(list);
  const declared = [...list[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual([...declared].sort(), [...components].sort());
});
