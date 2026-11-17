#!/usr/bin/env node
/* ============================================================================
   Development test identities (controlled, NEVER production authentication)

   Creates FICTIONAL login accounts for local development and API testing:
     - DEV-ADMIN   Super Admin (global role, no Site)
     - DEV-TECH-1  User, Site SANGATTA
     - DEV-TECH-2  User, Site BENGALON
   The password for all of them comes from the environment variable SEED_TEST_PASSWORD
   (never from a file in the repository). It is hashed with bcrypt here, so the plaintext
   never reaches SQL files, the database or the audit log.

   Safety:
   - Refuses to run unless MH02_ENV=development and --confirm-dev-seed is given.
   - Idempotent: it only adds the accounts that are missing, tagged data_source = 'dev_seed'.
     The application refuses to start in production while any dev_seed user exists.
   - Runs as the application login (mh02_app) from .env.local, inside one SQL transaction,
     and writes a user_create audit row per user (action user_create, no password data).
   - Requires the Sites from the dev seed (D001) to exist.

   Usage (PowerShell):
     $env:MH02_ENV = "development"; $env:SEED_TEST_PASSWORD = "<choose a strong password>"
     node database/scripts/seed-test-users.mjs --confirm-dev-seed
   ============================================================================ */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import path from "node:path";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = line.slice(eq + 1).trim();
  }
}
loadEnvFile(path.join(root, ".env.local"));

function stop(message, code = 2) {
  console.error(`REFUSED: ${message}`);
  process.exit(code);
}

if (process.env.MH02_ENV !== "development") stop("MH02_ENV must be 'development'.");
if (!process.argv.includes("--confirm-dev-seed")) stop("pass --confirm-dev-seed to confirm.");
const password = process.env.SEED_TEST_PASSWORD;
if (!password || password.length < 12) stop("set SEED_TEST_PASSWORD (at least 12 characters) in the environment.");
for (const key of ["DB_SERVER", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[key]) stop(`${key} is not set (.env.local).`);
}
if (/^(sa|sys)/i.test(process.env.DB_USER)) stop("DB_USER must be the application login.");

const sql = (await import("mssql")).default;
const bcrypt = (await import("bcryptjs")).default;

const pool = await new sql.ConnectionPool({
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeout: 8000,
  options: {
    encrypt: (process.env.DB_ENCRYPT || "true").toLowerCase() !== "false",
    trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE || "false").toLowerCase() === "true",
  },
}).connect();

const accounts = [
  { nrp: "DEV-ADMIN", name: "Dev Super Admin", role: "superadmin", site: null },
  { nrp: "DEV-TECH-1", name: "Dev Technician Sangatta", role: "user", site: "SANGATTA" },
  { nrp: "DEV-TECH-2", name: "Dev Technician Bengalon", role: "user", site: "BENGALON" },
];

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  const actor = await new sql.Request(tx).query(`SELECT user_id, name FROM dbo.users WHERE nrp = N'DEV-SEED-ACTOR'`);
  if (!actor.recordset[0]) throw new Error("The dev seed actor does not exist. Run the dev seed (D001) first.");
  const hash = await bcrypt.hash(password, 12);
  for (const a of accounts) {
    const exists = await new sql.Request(tx).input("nrp", sql.NVarChar(30), a.nrp).query(`SELECT 1 AS x FROM dbo.users WHERE nrp = @nrp`);
    if (exists.recordset[0]) {
      console.log(`  exists: ${a.nrp}`);
      continue;
    }
    const site = a.site
      ? (await new sql.Request(tx).input("c", sql.NVarChar(30), a.site).query(`SELECT site_id FROM dbo.sites WHERE site_code = @c`)).recordset[0]
      : null;
    if (a.site && !site) throw new Error(`Site ${a.site} does not exist (dev seed D001 not applied).`);
    const inserted = await new sql.Request(tx)
      .input("nrp", sql.NVarChar(30), a.nrp)
      .input("name", sql.NVarChar(120), a.name)
      .input("role", sql.NVarChar(30), a.role)
      .input("site", sql.Int, site ? site.site_id : null)
      .input("hash", sql.NVarChar(255), hash)
      .query(
        `INSERT INTO dbo.users (nrp, name, role_id, site_id, password_hash, status, data_source)
         OUTPUT INSERTED.user_id
         SELECT @nrp, @name, r.role_id, @site, @hash, 'active', 'dev_seed' FROM dbo.roles r WHERE r.role_code = @role`
      );
    await new sql.Request(tx)
      .input("actor", sql.UniqueIdentifier, actor.recordset[0].user_id)
      .input("actorName", sql.NVarChar(120), actor.recordset[0].name)
      .input("site", sql.Int, site ? site.site_id : null)
      .input("nrp", sql.NVarChar(60), a.nrp)
      .input("entity", sql.UniqueIdentifier, inserted.recordset[0].user_id)
      .input("group", sql.UniqueIdentifier, randomUUID())
      .input("newV", sql.NVarChar(sql.MAX), JSON.stringify({ nrp: a.nrp, name: a.name, role: a.role, site_id: site ? site.site_id : null, status: "active" }))
      .query(
        `INSERT INTO dbo.audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation, new_values, change_group_id, action)
         VALUES (@actor, @actorName, @site, 'user_management', @nrp, @entity, 'INSERT', @newV, @group, 'user_create')`
      );
    console.log(`  created: ${a.nrp} (${a.role}${a.site ? ", " + a.site : ""})`);
  }
  await tx.commit();
  console.log("Done. The password is the value of SEED_TEST_PASSWORD (not stored anywhere).");
} catch (error) {
  try {
    await tx.rollback();
  } catch {
    /* nothing to roll back */
  }
  console.error(`FAILED: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
  process.exitCode = 1;
} finally {
  await pool.close();
}
