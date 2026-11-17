#!/usr/bin/env node
/* ============================================================================
   MH02 connection check (Phase 4a): Node.js `mssql` -> SQL Server as mh02_app

   Reads connection settings from .env.local (project root) or the process
   environment. Server-side only. Never prints the password.

   READ-ONLY: it changes no data and no schema. Its only write-like action is a
   transaction-owned application lock taken and released (rolled back) to prove
   that sp_getapplock works for this login.

   Checks
     1. Connect with the settings (encrypt on, TCP).
     2. Identity: logged in as mh02_app; NOT sysadmin; NOT db_owner.
     3. Database context, compatibility level (ISJSON CHECKs need >= 130) and
        whether READ_COMMITTED_SNAPSHOT is on (recorded, not assumed).
     4. Parameterized query works.
     5. sp_getapplock can be called (design 3.19) inside a transaction that is
        rolled back.
     6. Effective permissions on the append-only tables, WHEN the tables exist
        (HAS_PERMS_BY_NAME; no DML is attempted): audit_log and device_events
        allow INSERT but not UPDATE/DELETE; idempotency_keys does not allow
        DELETE; schema_migrations does not allow UPDATE/DELETE. Skipped with a
        notice while the migrations are not applied or P4A_02 was not run.

   Usage: node database/scripts/db-check-connection.mjs
   Exit code: 0 all checks passed (skips allowed), 1 a check failed, 2 setup problem.
   ============================================================================ */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(projectRoot, '.env.local'));

function setupError(message) {
  console.error(`SETUP PROBLEM: ${message}`);
  process.exit(2);
}

for (const key of ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[key]) setupError(`${key} is not set (.env.local or environment).`);
}
if (process.env.DB_USER === 'sa' || /^sys/i.test(process.env.DB_USER)) {
  setupError('Refusing to run with a privileged login. DB_USER must be the least-privilege application login.');
}

let sql;
try {
  sql = (await import('mssql')).default;
} catch {
  setupError('The "mssql" package is not installed. Run: npm install mssql');
}

const config = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeout: 8000,
  requestTimeout: 15000,
  options: {
    encrypt: (process.env.DB_ENCRYPT || 'true').toLowerCase() !== 'false',
    trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE || 'false').toLowerCase() === 'true',
    enableArithAbort: true,
  },
  pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
};

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const tag = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` - ${detail}` : ''}`);
}

function explain(error) {
  /* Messages from tedious never contain the password, but keep it short. */
  const code = error?.code ? ` (${error.code})` : '';
  return `${(error?.message || String(error)).split('\n')[0]}${code}`;
}

let pool;
try {
  console.log(`Connecting to ${config.server}:${config.port} database ${config.database} as ${config.user} (encrypt=${config.options.encrypt}, trustServerCertificate=${config.options.trustServerCertificate}) ...`);
  pool = await new sql.ConnectionPool(config).connect();
  record('connect', 'PASS');
} catch (error) {
  record('connect', 'FAIL', explain(error));
  console.error('\nHint: TCP/IP must be enabled and the server in Mixed Mode (database/setup/PHASE4A_GUIDE.md), and the login must exist (Initialize-AppLogin.ps1).');
  process.exit(1);
}

try {
  const who = await pool.request().query(`
    SELECT DB_NAME() AS db,
           SUSER_SNAME() AS login_name,
           USER_NAME() AS db_user,
           CAST(IS_SRVROLEMEMBER('sysadmin') AS int) AS is_sysadmin,
           CAST(IS_MEMBER('db_owner') AS int) AS is_db_owner,
           (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) AS compat_level,
           (SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = DB_NAME()) AS rcsi
  `);
  const row = who.recordset[0];
  record('database context', row.db === config.database ? 'PASS' : 'FAIL', `db=${row.db}`);
  record('login is the application login', row.login_name === config.user ? 'PASS' : 'FAIL', `login=${row.login_name}, db user=${row.db_user}`);
  record('login is not sysadmin', row.is_sysadmin === 0 ? 'PASS' : 'FAIL');
  record('user is not db_owner', row.is_db_owner === 0 ? 'PASS' : 'FAIL');
  record('compatibility level >= 130 (ISJSON)', row.compat_level >= 130 ? 'PASS' : 'FAIL', `level=${row.compat_level}`);
  console.log(`      info: READ_COMMITTED_SNAPSHOT is ${row.rcsi ? 'ON' : 'OFF'} (recorded; design works either way)`);

  const param = await pool.request().input('probe', sql.Int, 42).query('SELECT @probe AS probe');
  record('parameterized query', param.recordset[0].probe === 42 ? 'PASS' : 'FAIL');

  /* sp_getapplock inside a transaction that is rolled back: proves the call works for this login. */
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    const lock = await new sql.Request(tx)
      .input('Resource', sql.NVarChar(255), 'mh02:connection-check')
      .output('result', sql.Int)
      .query(`DECLARE @r INT;
              EXEC @r = sp_getapplock @Resource = @Resource, @LockMode = 'Exclusive',
                                      @LockOwner = 'Transaction', @LockTimeout = 0;
              SET @result = @r;`);
    record('sp_getapplock callable', lock.output.result >= 0 ? 'PASS' : 'FAIL', `result=${lock.output.result}`);
  } catch (error) {
    record('sp_getapplock callable', 'FAIL', explain(error));
  } finally {
    try { await tx.rollback(); } catch { /* nothing to roll back */ }
  }

  /* Effective permissions (no DML): only when the tables exist. */
  const present = await pool.request().query(`
    SELECT name FROM sys.tables
    WHERE schema_id = SCHEMA_ID(N'dbo')
      AND name IN (N'audit_log', N'device_events', N'idempotency_keys', N'schema_migrations')`);
  const have = new Set(present.recordset.map((r) => r.name));
  const expectations = [
    ['audit_log', 'INSERT', 1], ['audit_log', 'UPDATE', 0], ['audit_log', 'DELETE', 0],
    ['device_events', 'INSERT', 1], ['device_events', 'UPDATE', 0], ['device_events', 'DELETE', 0],
    ['idempotency_keys', 'UPDATE', 1], ['idempotency_keys', 'DELETE', 0],
    ['schema_migrations', 'UPDATE', 0], ['schema_migrations', 'DELETE', 0],
  ];
  for (const [table, permission, expected] of expectations) {
    const label = `permission ${permission} on ${table} = ${expected ? 'allowed' : 'denied'}`;
    if (!have.has(table)) {
      record(label, 'SKIP', 'table does not exist yet (migrations not applied)');
      continue;
    }
    const res = await pool.request()
      .input('obj', sql.NVarChar(128), `dbo.${table}`)
      .input('perm', sql.NVarChar(32), permission)
      .query(`SELECT CAST(HAS_PERMS_BY_NAME(@obj, N'OBJECT', @perm) AS int) AS allowed`);
    const allowed = res.recordset[0].allowed;
    /* Before P4A_02 the login has no permissions at all, so "allowed" checks fail until it is applied. */
    record(label, allowed === expected ? 'PASS' : 'FAIL', `effective=${allowed}`);
  }
} catch (error) {
  record('checks', 'FAIL', explain(error));
} finally {
  await pool.close();
}

const failed = results.filter((r) => r.status === 'FAIL').length;
const skipped = results.filter((r) => r.status === 'SKIP').length;
console.log(`\nSummary: ${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped.`);
process.exit(failed === 0 ? 0 : 1);
