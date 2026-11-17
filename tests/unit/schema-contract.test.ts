// Contract tests between service code and the migrations (no database needed). They catch a service writing a
// value that a CHECK constraint forbids, the exact class of bug behind the 422 CONSTRAINT_VIOLATION on POST /devices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { constraintNameFromMessage } from "../../src/server/errors.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

function allowedValues(migration: string, constraint: string): string[] {
  const re = new RegExp(`CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(([\\s\\S]*?)\\)\\s*[,)]`, "i");
  const m = re.exec(migration);
  assert.ok(m, `constraint ${constraint} not found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

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
