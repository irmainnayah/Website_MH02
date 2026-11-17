#!/usr/bin/env node
/* ============================================================================
   MH02 database runner (migrations and seeds)

   Source of truth: docs/PHASE2_DATABASE_DESIGN.md (Revision 11), section 8.

   - No npm dependencies. It drives the `sqlcmd` command line tool, so it works
     with Windows Authentication and needs no database driver package.
   - Forward-only. Never drops, never edits an applied migration.
   - SAFE BY DEFAULT: every command that would change the database is a DRY RUN
     unless it is given --apply AND the environment variable
     MH02_ALLOW_DB_CHANGES=yes is set.
   - The `list` command is fully offline: it reads local files only and never
     connects to a database.

   Commands
     list                      Offline. Show migration files and their checksums.
     status                    Connect read-only; compare applied versions and
                               checksums with the local files.
     migrate                   Plan (dry run) or apply pending migrations.
     seed-reference            Plan or apply seed/reference/*.sql (production-safe,
                               idempotent). Requires all migrations applied.
     seed-dev                  Plan or apply seed/dev/*.sql (fictional data, dev
                               only). Also requires MH02_ENV=development and
                               --confirm-dev-seed.

   Flags
     --apply                   Actually change the database (see above).
     --confirm-dev-seed        Required for seed-dev together with --apply.

   Environment
     DB_SERVER                 default: localhost
     DB_NAME                   default: db_asset_report (no other name is accepted)
     DB_USER / DB_PASSWORD     Optional. If DB_USER is unset, Windows
                               Authentication (-E) is used. The password is passed
                               to sqlcmd through SQLCMDPASSWORD, never on the
                               command line, and is never printed.
     DB_TRUST_CERT             default: true (local development with a
                               self-signed certificate). Set to false on a server
                               with a trusted certificate.
     SQLCMD_PATH               default: sqlcmd
     MH02_ALLOW_DB_CHANGES     must be "yes" for --apply
     MH02_ENV                  must be "development" for seed-dev

   Exit codes: 0 ok, 1 failure, 2 refused (missing confirmation or unsafe state).
   ============================================================================ */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS_DIR = path.join(DB_ROOT, 'migrations');
const SEED_REFERENCE_DIR = path.join(DB_ROOT, 'seed', 'reference');
const SEED_DEV_DIR = path.join(DB_ROOT, 'seed', 'dev');
const EXPECTED_DB = 'db_asset_report';

const MIGRATION_FILE = /^V(\d{3})__([a-z0-9_]+)\.sql$/;
const SEED_REFERENCE_FILE = /^R(\d{3})__([a-z0-9_]+)\.sql$/;
const SEED_DEV_FILE = /^D(\d{3})__([a-z0-9_]+)\.sql$/;

class Refusal extends Error {}
class Failure extends Error {}

/* ---------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const command = argv[0];
const flags = new Set(argv.slice(1).filter((a) => a.startsWith('--')));
const knownFlags = new Set(['--apply', '--confirm-dev-seed']);
for (const f of flags) {
  if (!knownFlags.has(f)) {
    fail(`Unknown flag ${f}`);
  }
}

/* ------------------------------------------------------------------ helpers */

function fail(message, code = 1) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function sha256Normalized(file) {
  /* Normalize line endings so the checksum is identical on every machine. */
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function listSqlFiles(dir, pattern, label) {
  if (!existsSync(dir)) {
    return [];
  }
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sql'));
  const entries = [];
  for (const file of files) {
    const match = pattern.exec(file);
    if (!match) {
      throw new Failure(`${label}: file name "${file}" does not match the required pattern ${pattern}`);
    }
    entries.push({
      number: Number(match[1]),
      name: match[2],
      file,
      fullPath: path.join(dir, file),
      checksum: sha256Normalized(path.join(dir, file)),
    });
  }
  entries.sort((a, b) => a.number - b.number);
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].number !== i + 1) {
      throw new Failure(`${label}: expected number ${i + 1} but found ${entries[i].file} (gap or duplicate)`);
    }
  }
  return entries;
}

function listMigrations() {
  return listSqlFiles(MIGRATIONS_DIR, MIGRATION_FILE, 'migrations').map((m) => ({
    ...m,
    version: `V${String(m.number).padStart(3, '0')}`,
  }));
}

function config() {
  const server = process.env.DB_SERVER || 'localhost';
  const database = process.env.DB_NAME || EXPECTED_DB;
  if (database !== EXPECTED_DB) {
    throw new Refusal(`DB_NAME must be ${EXPECTED_DB} (the migration files guard this name). Got "${database}".`);
  }
  if (!/^[A-Za-z0-9_.\\-]+(,\d+)?$/.test(server)) {
    throw new Refusal('DB_SERVER contains unexpected characters.');
  }
  const user = process.env.DB_USER || '';
  const trust = (process.env.DB_TRUST_CERT || 'true').toLowerCase() !== 'false';
  return { server, database, user, trust, sqlcmd: process.env.SQLCMD_PATH || 'sqlcmd' };
}

function baseArgs(cfg) {
  const args = ['-S', cfg.server, '-d', cfg.database, '-b', '-I', '-x'];
  if (cfg.trust) {
    args.push('-C');
  }
  if (cfg.user) {
    args.push('-U', cfg.user);
  } else {
    args.push('-E');
  }
  return args;
}

function runSqlcmd(cfg, extraArgs) {
  const env = { ...process.env };
  if (cfg.user) {
    env.SQLCMDPASSWORD = process.env.DB_PASSWORD || '';
  } else {
    delete env.SQLCMDPASSWORD;
  }
  const result = spawnSync(cfg.sqlcmd, [...baseArgs(cfg), ...extraArgs], {
    env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    throw new Failure(`Could not run ${cfg.sqlcmd}: ${result.error.message}`);
  }
  return result;
}

function query(cfg, sql) {
  const result = runSqlcmd(cfg, ['-h', '-1', '-W', '-s', '|', '-Q', `SET NOCOUNT ON; ${sql}`]);
  if (result.status !== 0) {
    throw new Failure(`Query failed:\n${(result.stdout || '') + (result.stderr || '')}`.trim());
  }
  return (result.stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function requireContext(cfg) {
  const rows = query(cfg, 'SELECT DB_NAME();');
  if (rows[0] !== EXPECTED_DB) {
    throw new Refusal(`Connected database is "${rows[0]}", expected ${EXPECTED_DB}.`);
  }
}

function getApplied(cfg) {
  const rows = query(
    cfg,
    "IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL SELECT N'NO_TABLE' " +
      'ELSE SELECT version + N\'|\' + name + N\'|\' + checksum FROM dbo.schema_migrations ORDER BY version;'
  );
  if (rows.length === 1 && rows[0] === 'NO_TABLE') {
    return [];
  }
  return rows.map((row) => {
    const [version, name, checksum] = row.split('|');
    return { version, name, checksum };
  });
}

/* Compare applied versions with local files. Throws on any inconsistency. */
function buildPlan(files, applied) {
  const byVersion = new Map(files.map((f) => [f.version, f]));
  for (const a of applied) {
    const local = byVersion.get(a.version);
    if (!local) {
      throw new Failure(`Applied migration ${a.version} (${a.name}) has no local file.`);
    }
    if (local.checksum !== a.checksum) {
      throw new Failure(
        `Applied migration ${a.version} was changed after it was applied (checksum mismatch). ` +
          'Applied migrations must never be edited; add a new forward-only migration instead.'
      );
    }
  }
  const appliedVersions = new Set(applied.map((a) => a.version));
  const maxApplied = applied.length ? applied[applied.length - 1].version : '';
  const pending = files.filter((f) => !appliedVersions.has(f.version));
  for (const p of pending) {
    if (p.version < maxApplied) {
      throw new Failure(`Pending migration ${p.version} is older than the applied ${maxApplied} (out of order).`);
    }
  }
  return { pending, appliedCount: applied.length };
}

function requireApplyPermission() {
  if (process.env.MH02_ALLOW_DB_CHANGES !== 'yes') {
    throw new Refusal('Refusing to change the database: set MH02_ALLOW_DB_CHANGES=yes together with --apply.');
  }
}

function runFile(cfg, fullPath) {
  const result = runSqlcmd(cfg, ['-i', fullPath]);
  const output = ((result.stdout || '') + (result.stderr || '')).trim();
  if (result.status !== 0) {
    throw new Failure(`sqlcmd reported an error for ${path.basename(fullPath)}:\n${output}`);
  }
  return output;
}

function recordMigration(cfg, m) {
  if (!/^V\d{3}$/.test(m.version) || !/^[a-z0-9_]+$/.test(m.name) || !/^[a-f0-9]{64}$/.test(m.checksum)) {
    throw new Failure('Refusing to record a migration with unexpected characters.');
  }
  const sql =
    'SET QUOTED_IDENTIFIER ON; ' +
    `INSERT INTO dbo.schema_migrations (version, name, checksum) VALUES (N'${m.version}', N'${m.name}', '${m.checksum}');`;
  const result = runSqlcmd(cfg, ['-Q', sql]);
  if (result.status !== 0) {
    throw new Failure(
      `${m.version} was APPLIED but recording it in schema_migrations FAILED:\n` +
        `${((result.stdout || '') + (result.stderr || '')).trim()}\n` +
        'Do NOT re-run it. Record it manually with:\n' +
        `  ${sql}`
    );
  }
}

/* ----------------------------------------------------------------- commands */

function cmdList() {
  const files = listMigrations();
  console.log('Migration files (offline; no database connection):');
  if (files.length === 0) {
    console.log('  (none)');
  }
  for (const f of files) {
    console.log(`  ${f.version}  ${f.name.padEnd(24)} ${f.checksum}`);
  }
  const ref = listSqlFiles(SEED_REFERENCE_DIR, SEED_REFERENCE_FILE, 'seed/reference');
  const dev = listSqlFiles(SEED_DEV_DIR, SEED_DEV_FILE, 'seed/dev');
  console.log(`Reference seeds: ${ref.map((r) => r.file).join(', ') || '(none)'}`);
  console.log(`Dev seeds:       ${dev.map((d) => d.file).join(', ') || '(none)'}`);
}

function cmdStatus() {
  const cfg = config();
  requireContext(cfg);
  const files = listMigrations();
  const applied = getApplied(cfg);
  const plan = buildPlan(files, applied);
  console.log(`Database ${cfg.database} on ${cfg.server}`);
  console.log(`Applied: ${plan.appliedCount}   Pending: ${plan.pending.length}`);
  for (const p of plan.pending) {
    console.log(`  pending ${p.version} ${p.name}`);
  }
}

function cmdMigrate() {
  const cfg = config();
  const files = listMigrations();
  if (files.length === 0) {
    throw new Failure('No migration files found.');
  }
  requireContext(cfg);
  const applied = getApplied(cfg);
  const plan = buildPlan(files, applied);
  console.log(`Database ${cfg.database} on ${cfg.server}: ${plan.appliedCount} applied, ${plan.pending.length} pending.`);
  if (plan.pending.length === 0) {
    console.log('Nothing to do.');
    return;
  }
  for (const p of plan.pending) {
    console.log(`  would apply ${p.version} ${p.name}  (${p.checksum.slice(0, 12)}...)`);
  }
  if (!flags.has('--apply')) {
    console.log('DRY RUN: nothing was changed. Re-run with --apply (and MH02_ALLOW_DB_CHANGES=yes) to apply.');
    return;
  }
  requireApplyPermission();
  for (const p of plan.pending) {
    console.log(`Applying ${p.version} ${p.name} ...`);
    runFile(cfg, p.fullPath);
    recordMigration(cfg, p);
    console.log(`  ${p.version} applied and recorded.`);
  }
}

function runSeeds(kind) {
  const isDev = kind === 'dev';
  const dir = isDev ? SEED_DEV_DIR : SEED_REFERENCE_DIR;
  const pattern = isDev ? SEED_DEV_FILE : SEED_REFERENCE_FILE;
  const seeds = listSqlFiles(dir, pattern, isDev ? 'seed/dev' : 'seed/reference');
  if (seeds.length === 0) {
    throw new Failure(`No ${kind} seed files found.`);
  }
  const cfg = config();
  requireContext(cfg);
  const files = listMigrations();
  const plan = buildPlan(files, getApplied(cfg));
  if (plan.pending.length > 0) {
    throw new Refusal('Apply all migrations before seeding (pending migrations exist).');
  }
  console.log(`Seeds (${kind}) for ${cfg.database} on ${cfg.server}:`);
  for (const s of seeds) {
    console.log(`  would run ${s.file}`);
  }
  if (!flags.has('--apply')) {
    console.log('DRY RUN: nothing was changed. Re-run with --apply (and MH02_ALLOW_DB_CHANGES=yes) to apply.');
    return;
  }
  requireApplyPermission();
  if (isDev) {
    if (process.env.MH02_ENV !== 'development') {
      throw new Refusal('seed-dev refuses to run unless MH02_ENV=development.');
    }
    if (!flags.has('--confirm-dev-seed')) {
      throw new Refusal('seed-dev requires the explicit --confirm-dev-seed flag.');
    }
  }
  for (const s of seeds) {
    console.log(`Running ${s.file} ...`);
    runFile(cfg, s.fullPath);
    console.log('  done.');
  }
}

function cmdVerify() {
  const cfg = config();
  requireContext(cfg);
  const plan = buildPlan(listMigrations(), getApplied(cfg));
  if (plan.pending.length > 0) {
    throw new Refusal('Apply all migrations before verifying (pending migrations exist).');
  }
  const script = path.join(DB_ROOT, 'scripts', 'verify-schema.sql');
  console.log('verify-schema.sql: structure, seeds, constraint/trigger/permission behavior.');
  console.log('All test writes run inside one transaction that is rolled back; the audit_log identity is re-seeded afterwards.');
  if (!flags.has('--apply')) {
    console.log('DRY RUN: not executed. Re-run with --apply (and MH02_ALLOW_DB_CHANGES=yes).');
    return;
  }
  requireApplyPermission();
  const result = runSqlcmd(cfg, ['-h', '-1', '-W', '-s', '|', '-i', script]);
  const text = ((result.stdout || '') + (result.stderr || '')).trim();
  const rows = text.split(/\r?\n/).filter((l) => l.startsWith('RESULT|'));
  let passed = 0;
  let failed = 0;
  for (const row of rows) {
    const [, status, name, detail] = row.split('|');
    if (status === 'PASS') {
      passed += 1;
      console.log(`  PASS  ${name}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${name}\n        ${detail}`);
    }
  }
  if (result.status !== 0 || rows.length === 0) {
    throw new Failure(`verify-schema.sql did not complete:\n${text.slice(0, 4000)}`);
  }
  console.log(`\nVerification: ${passed} passed, ${failed} failed (${rows.length} checks).`);
  if (failed > 0) {
    process.exit(1);
  }
}

/* --------------------------------------------------------------------- main */

try {
  switch (command) {
    case 'list':
      cmdList();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'migrate':
      cmdMigrate();
      break;
    case 'seed-reference':
      runSeeds('reference');
      break;
    case 'seed-dev':
      runSeeds('dev');
      break;
    case 'verify':
      cmdVerify();
      break;
    default:
      console.log('Usage: node database/scripts/db-migrate.mjs <list|status|migrate|seed-reference|seed-dev|verify> [--apply] [--confirm-dev-seed]');
      console.log('Every command except "list" connects to the database; changes need --apply and MH02_ALLOW_DB_CHANGES=yes.');
      process.exit(command ? 1 : 0);
  }
} catch (error) {
  if (error instanceof Refusal) {
    fail(error.message, 2);
  }
  fail(error instanceof Error ? error.message : String(error), 1);
}
