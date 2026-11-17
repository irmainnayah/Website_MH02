// Transaction photos (design 3.12). Bytes live on a storage adapter (local file system), never in SQL Server.
//
// Create flow: receive -> `_staging/{photo_id}.part` -> validate (size, magic bytes) -> atomic rename to `.upload`
// -> the creation SQL transaction inserts the transaction_photos rows -> COMMIT -> finalize (move to the final
// path). The staging path is derived from photo_id alone, so a crash between COMMIT and the move is recoverable by
// the reconciler. Finalization takes a per-photo lock in SQL Server (sp_getapplock), so two processes never race.

import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, link, mkdir, open, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { getConfig } from "./config.ts";
import { err } from "./errors.ts";
import { getPool, request, sql, uuid, withTransaction } from "./db.ts";
import type { Db } from "./db.ts";
import type { ActivityType } from "./formNumber.ts";
import { readSiteFilter } from "./scope.ts";
import type { AuthUser } from "./scope.ts";

/* ------------------------------------------------------------ pure helpers */

/** Slot keys per transaction type, taken from the approved UI (installation, replacement, removal, troubleshoot). */
export const PHOTO_SLOTS: Record<ActivityType, readonly string[]> = {
  installation: ["mh02_installed", "camera_dashboard_angle", "nodered_config", "gps_antenna"],
  replacement: ["mh02_new_installed", "mh02_old_removed", "nodered_config", "gps_antenna"],
  removal: ["beforeDevice", "componentSet"],
  troubleshoot: ["beforeRepair", "afterRepair"],
};

export const MAX_PHOTOS_PER_TRANSACTION = 8;

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";
const EXTENSION: Record<PhotoMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The real type comes from the file's magic bytes; the client-declared type and filename are never trusted. */
export function sniffImageType(head: Uint8Array): PhotoMime | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionFor(mime: PhotoMime): string {
  return EXTENSION[mime];
}

/** photos/{yyyy}/{mm}/{photo_id}.{ext}, UTC year/month of receipt, always relative. */
export function finalPathFor(photoId: string, mime: PhotoMime, receivedAt: Date): string {
  const yyyy = String(receivedAt.getUTCFullYear());
  const mm = String(receivedAt.getUTCMonth() + 1).padStart(2, "0");
  return `photos/${yyyy}/${mm}/${photoId}.${EXTENSION[mime]}`;
}

export function isAllowedSlot(type: ActivityType, slot: string): boolean {
  return PHOTO_SLOTS[type].includes(slot);
}

const PHOTO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Resolve a relative path under the storage root; refuses anything that would leave it. */
export function safeJoin(root: string, relative: string): string {
  if (!relative || relative.includes("\0") || /^[\\/]/.test(relative) || /^[A-Za-z]:/.test(relative)) {
    throw new Error("unsafe storage path");
  }
  const base = resolve(root);
  const full = resolve(base, relative);
  if (full !== base && !full.startsWith(base + sep)) throw new Error("unsafe storage path");
  return full;
}

/* ------------------------------------------------------------------ types */

export interface StagedPhoto {
  photoId: string;
  slotKey: string;
  caption: string | null;
  originalFilename: string | null;
  mimeType: PhotoMime;
  sizeBytes: number;
  sha256: string;
  storagePath: string;
  uploadedAt: Date;
}

export interface PhotoInput {
  slotKey: string;
  caption?: string | null;
  filename?: string | null;
  /** The file content. Read fully (the size limit is checked first). */
  data: Uint8Array;
}

export interface PhotoDto {
  photoId: string;
  slotKey: string;
  caption: string | null;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

/* --------------------------------------------------------- storage layout */

const stagingDir = () => join(getConfig().photo.storageRoot, "_staging");
const quarantineDir = () => join(getConfig().photo.storageRoot, "_quarantine");
const partPath = (id: string) => join(stagingDir(), `${id}.part`);
const uploadPath = (id: string) => join(stagingDir(), `${id}.upload`);
const copyPath = (id: string) => join(stagingDir(), `${id}.copy`);

/** Creates the folders and the `.storage-ok` marker the integrity check uses to detect a wrong/unmounted volume. */
export async function ensureStorage(): Promise<void> {
  const root = getConfig().photo.storageRoot;
  await mkdir(stagingDir(), { recursive: true });
  await mkdir(quarantineDir(), { recursive: true });
  try {
    await writeFile(join(root, ".storage-ok"), "mh02 photo storage\n", { flag: "wx" });
  } catch (e) {
    if ((e as { code?: string }).code !== "EEXIST") throw e;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return false;
    throw e;
  }
}

async function sha256OfFile(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  let size = 0;
  const fh = await open(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, null);
      if (bytesRead === 0) break;
      hash.update(buf.subarray(0, bytesRead));
      size += bytesRead;
    }
  } finally {
    await fh.close();
  }
  return { sha256: hash.digest("hex"), size };
}

/* -------------------------------------------------------------- receiving */

/**
 * Validate and stage the uploads of one request. Nothing is committed yet: the returned `StagedPhoto`s are inserted
 * by the creation SQL transaction. On any failure the files staged so far are removed (they are referenced by nothing).
 */
export async function stagePhotos(type: ActivityType, inputs: PhotoInput[], now: Date = new Date()): Promise<StagedPhoto[]> {
  if (inputs.length === 0) return [];
  const cfg = getConfig().photo;
  if (inputs.length > MAX_PHOTOS_PER_TRANSACTION) {
    throw err.badRequest("TOO_MANY_PHOTOS", `At most ${MAX_PHOTOS_PER_TRANSACTION} photos per transaction.`);
  }
  const seen = new Set<string>();
  for (const p of inputs) {
    if (!isAllowedSlot(type, p.slotKey)) {
      throw err.badRequest("PHOTO_SLOT_INVALID", `Photo slot "${p.slotKey}" is not valid for a ${type}.`);
    }
    if (seen.has(p.slotKey)) throw err.badRequest("PHOTO_SLOT_DUPLICATE", `Photo slot "${p.slotKey}" was sent twice.`);
    seen.add(p.slotKey);
    if (p.caption && p.caption.length > 200) throw err.badRequest("PHOTO_CAPTION_TOO_LONG", "A photo caption has at most 200 characters.");
  }
  await ensureStorage();
  const staged: StagedPhoto[] = [];
  try {
    for (const p of inputs) {
      if (p.data.length === 0) throw err.badRequest("PHOTO_EMPTY", `Photo "${p.slotKey}" is empty.`);
      if (p.data.length > cfg.maxBytes) {
        throw err.badRequest("PHOTO_TOO_LARGE", `Photo "${p.slotKey}" is larger than ${cfg.maxBytes} bytes.`);
      }
      const mime = sniffImageType(p.data.subarray(0, 16));
      if (!mime) throw err.badRequest("PHOTO_TYPE_INVALID", `Photo "${p.slotKey}" must be a JPEG, PNG or WebP image.`);
      const photoId = randomUUID();
      const sha256 = createHash("sha256").update(p.data).digest("hex");
      // .part is exclusive-create; the atomic rename to .upload marks it complete and validated.
      await writeFile(partPath(photoId), p.data, { flag: "wx" });
      await rename(partPath(photoId), uploadPath(photoId));
      staged.push({
        photoId,
        slotKey: p.slotKey,
        caption: p.caption?.trim() || null,
        originalFilename: p.filename ? p.filename.replace(/[\\/\0]/g, "_").slice(0, 255) : null,
        mimeType: mime,
        sizeBytes: p.data.length,
        sha256,
        storagePath: finalPathFor(photoId, mime, now),
        uploadedAt: now,
      });
    }
  } catch (e) {
    await discardStaged(staged);
    throw e;
  }
  return staged;
}

/** Remove the `.upload` files of a request that definitely created nothing (replay or verified failure). */
export async function discardStaged(staged: readonly StagedPhoto[]): Promise<void> {
  for (const s of staged) {
    for (const p of [partPath(s.photoId), uploadPath(s.photoId)]) {
      await unlink(p).catch(() => undefined);
    }
  }
}

/** Fingerprint of the uploads for the idempotency request hash: same key + different photos = a different request. */
export function photosFingerprint(staged: readonly StagedPhoto[]): { slot: string; sha256: string; caption: string | null }[] {
  return [...staged].map((s) => ({ slot: s.slotKey, sha256: s.sha256, caption: s.caption })).sort((a, b) => a.slot.localeCompare(b.slot));
}

/** Insert the metadata rows inside the creation transaction. */
export async function insertPhotoRows(tx: Db, activityId: string, staged: readonly StagedPhoto[], actorId: string): Promise<void> {
  for (const s of staged) {
    await request(tx)
      .input("id", sql.UniqueIdentifier, s.photoId)
      .input("act", sql.UniqueIdentifier, activityId)
      .input("slot", sql.VarChar(40), s.slotKey)
      .input("caption", sql.NVarChar(200), s.caption)
      .input("path", sql.NVarChar(500), s.storagePath)
      .input("name", sql.NVarChar(255), s.originalFilename)
      .input("mime", sql.VarChar(50), s.mimeType)
      .input("size", sql.BigInt, s.sizeBytes)
      .input("sha", sql.Char(64), s.sha256)
      .input("by", sql.UniqueIdentifier, actorId)
      .input("at", sql.DateTime2(0), s.uploadedAt)
      .query(
        `INSERT INTO dbo.transaction_photos
           (photo_id, activity_id, slot_key, caption, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by, uploaded_at)
         VALUES (@id, @act, @slot, @caption, @path, @name, @mime, @size, @sha, @by, @at)`
      );
  }
}

/* ----------------------------------------------------------- per-photo lock */

/** Run `fn` while holding the exclusive SQL Server application lock `photo:{id}` (released at COMMIT/session end). */
async function withPhotoLock<T>(photoId: string, fn: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const timeout = getConfig().photo.lockTimeoutMs;
  return withTransaction(async (tx) => {
    const r = await request(tx)
      .input("res", sql.NVarChar(255), `photo:${photoId}`)
      .input("timeout", sql.Int, timeout)
      .query(`DECLARE @rc INT; EXEC @rc = sp_getapplock @Resource = @res, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @timeout; SELECT @rc AS rc;`);
    if (Number(r.recordset[0].rc) < 0) return { acquired: false as const };
    return { acquired: true as const, value: await fn() };
  });
}

/* -------------------------------------------------------------- finalizing */

export type FinalizeOutcome = "done" | "moved" | "lost" | "corrupt" | "lock_busy" | "no_row";

interface PhotoRow {
  photoId: string;
  activityId: string;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}

async function loadPhotoRow(photoId: string): Promise<PhotoRow | null> {
  const pool = await getPool();
  const r = await request(pool)
    .input("id", sql.UniqueIdentifier, photoId)
    .query(
      `SELECT photo_id, activity_id, storage_path, sha256, size_bytes, mime_type
       FROM dbo.transaction_photos WITH (READCOMMITTEDLOCK) WHERE photo_id = @id`
    );
  const row = r.recordset[0];
  if (!row) return null;
  return {
    photoId: uuid(row.photo_id),
    activityId: uuid(row.activity_id),
    storagePath: String(row.storage_path),
    sha256: String(row.sha256).trim().toLowerCase(),
    sizeBytes: Number(row.size_bytes),
    mimeType: String(row.mime_type),
  };
}

async function matchesRow(path: string, row: PhotoRow): Promise<boolean> {
  const st = await stat(path);
  if (st.size !== row.sizeBytes) return false;
  return (await sha256OfFile(path)).sha256 === row.sha256;
}

/** Rules of design 3.12 `finalize(photo_id)`. Idempotent and safe to retry after a crash. Never overwrites a final file. */
export async function finalizePhoto(photoId: string): Promise<FinalizeOutcome> {
  const locked = await withPhotoLock(photoId, async (): Promise<FinalizeOutcome> => {
    const row = await loadPhotoRow(photoId); // re-read under the lock
    if (!row) return "no_row";
    const root = getConfig().photo.storageRoot;
    const finalFile = safeJoin(root, row.storagePath);
    const upload = uploadPath(photoId);
    const copy = copyPath(photoId);

    if (await exists(finalFile)) {
      if (await matchesRow(finalFile, row)) {
        await unlink(upload).catch(() => undefined);
        await unlink(copy).catch(() => undefined);
        return "done";
      }
      console.error(`[mh02] CRITICAL photo ${photoId}: final file does not match the recorded size/sha256 (PHOTO_CORRUPT); staging kept`);
      return "corrupt";
    }
    let source: string | null = null;
    if (await exists(upload)) source = upload;
    else if (await exists(copy)) source = copy; // the only remaining copy: used only if it verifies
    if (!source) {
      console.error(`[mh02] CRITICAL photo ${photoId}: no staging and no final file (PHOTO_LOST)`);
      return "lost";
    }
    if (!(await matchesRow(source, row))) {
      console.error(`[mh02] CRITICAL photo ${photoId}: staged file does not match the recorded size/sha256`);
      return "corrupt";
    }
    await mkdir(dirname(finalFile), { recursive: true });
    if (await exists(finalFile)) return "done"; // re-check right before the rename; it is never replaced
    try {
      // link + unlink = rename that can never replace an existing file (EEXIST instead).
      await link(source, finalFile);
      await unlink(source);
    } catch (e) {
      if ((e as { code?: string }).code === "EEXIST") return "corrupt";
      if ((e as { code?: string }).code !== "EXDEV" && (e as { code?: string }).code !== "EPERM" && (e as { code?: string }).code !== "ENOTSUP") throw e;
      // Different volume (or no hard-link support): verified copy through a temporary `.copy` file.
      await unlink(copy).catch(() => undefined);
      await copyFile(source, copy, fsConstants.COPYFILE_EXCL);
      if (!(await matchesRow(copy, row))) {
        await unlink(copy).catch(() => undefined);
        return "corrupt";
      }
      await rename(copy, finalFile);
      await unlink(upload).catch(() => undefined);
    }
    return "moved";
  });
  return locked.acquired ? locked.value : "lock_busy";
}

/** After COMMIT: finalize every photo of the request. A busy lock is not an error (the reconciler retries). */
export async function finalizeAll(staged: readonly StagedPhoto[]): Promise<void> {
  for (const s of staged) {
    try {
      await finalizePhoto(s.photoId);
    } catch (e) {
      console.error(`[mh02] photo ${s.photoId} finalize deferred: ${(e as { code?: string; name?: string }).code ?? (e as Error).name}`);
    }
  }
}

/* ---------------------------------------------------------------- quarantine */

/** After a transaction was deleted (COMMIT done): move its final files to quarantine; they are purged after N days. */
export async function quarantineFiles(rows: readonly { photoId: string; storagePath: string }[]): Promise<void> {
  const root = getConfig().photo.storageRoot;
  await mkdir(quarantineDir(), { recursive: true });
  for (const r of rows) {
    try {
      const from = safeJoin(root, r.storagePath);
      const ext = r.storagePath.split(".").pop() ?? "bin";
      const target = join(quarantineDir(), `${r.photoId}.${ext}`);
      if (await exists(from)) {
        if (await exists(target)) await unlink(from);
        else await rename(from, target);
      }
      // A file that was never finalized: drop the staging copy too (the row is gone).
      for (const p of [uploadPath(r.photoId), copyPath(r.photoId)]) await unlink(p).catch(() => undefined);
    } catch (e) {
      console.error(`[mh02] photo ${r.photoId} quarantine failed: ${(e as { code?: string }).code ?? (e as Error).name}`);
    }
  }
}

export async function purgeQuarantine(now: Date = new Date()): Promise<number> {
  const maxAgeMs = getConfig().photo.quarantineDays * 86_400_000;
  let removed = 0;
  let names: string[] = [];
  try {
    names = await readdir(quarantineDir());
  } catch {
    return 0;
  }
  for (const n of names) {
    const p = join(quarantineDir(), n);
    const st = await stat(p).catch(() => null);
    if (st?.isFile() && now.getTime() - st.mtimeMs > maxAgeMs) {
      await unlink(p).catch(() => undefined);
      removed++;
    }
  }
  return removed;
}

/* ---------------------------------------------------------------- reconciler */

export interface ReconcileReport {
  finalized: number;
  orphansRemoved: number;
  kept: number;
  alerts: string[];
  skipped?: string;
}

/**
 * Walk `_staging` (design 3.12 "Reconciler"). Row exists -> finalize. No row and older than the grace period and the
 * lookup definitive -> orphan, deleted under the per-photo lock. Database unreachable -> keep everything.
 */
export async function reconcileStaging(now: Date = new Date()): Promise<ReconcileReport> {
  const report: ReconcileReport = { finalized: 0, orphansRemoved: 0, kept: 0, alerts: [] };
  const graceMs = getConfig().photo.stagingGraceMinutes * 60_000;
  let names: string[];
  try {
    names = await readdir(stagingDir());
  } catch {
    report.skipped = "staging directory unavailable";
    return report;
  }
  const ids = new Set<string>();
  for (const n of names) {
    const m = /^([0-9a-f-]{36})\.(part|upload|copy)$/.exec(n);
    if (m && PHOTO_ID_RE.test(m[1])) ids.add(m[1]);
  }
  for (const id of ids) {
    const files = ["part", "upload", "copy"].map((e) => join(stagingDir(), `${id}.${e}`));
    let row: PhotoRow | null;
    try {
      row = await loadPhotoRow(id);
    } catch {
      report.kept += 1; // database unreachable or uncertain: delete nothing
      report.skipped = "database unavailable";
      continue;
    }
    if (row) {
      const outcome = await finalizePhoto(id).catch(() => "lock_busy" as FinalizeOutcome);
      if (outcome === "moved" || outcome === "done") report.finalized += 1;
      else if (outcome === "lost" || outcome === "corrupt") report.alerts.push(`${id}:${outcome}`);
      else report.kept += 1;
      continue;
    }
    // No row: look at the age of the newest staging file.
    let newest = 0;
    for (const f of files) {
      const st = await stat(f).catch(() => null);
      if (st) newest = Math.max(newest, st.mtimeMs);
    }
    if (newest === 0 || now.getTime() - newest < graceMs) {
      report.kept += 1;
      continue;
    }
    try {
      const res = await withPhotoLock(id, async () => {
        if (await loadPhotoRow(id)) return false; // re-read under the lock: a row appeared
        for (const f of files) await unlink(f).catch(() => undefined);
        return true;
      });
      if (res.acquired && res.value) report.orphansRemoved += 1;
      else report.kept += 1;
    } catch {
      report.kept += 1;
    }
  }
  return report;
}

/* ------------------------------------------------------------ integrity check */

export interface IntegrityReport {
  checked: number;
  ok: number;
  alerts: { photoId: string; code: "PHOTO_LOST" | "PHOTO_CORRUPT" | "PHOTO_STORAGE_UNAVAILABLE"; storagePath?: string }[];
  skipped?: string;
  cursorReset: boolean;
}

const cursorFile = () => join(stagingDir(), ".integrity-cursor");

async function storageHealthy(): Promise<boolean> {
  const root = getConfig().photo.storageRoot;
  return (await exists(join(root, ".storage-ok")).catch(() => false)) && (await exists(stagingDir()).catch(() => false));
}

/** Bounded, keyset-paginated check of committed photos. Never modifies rows and never fabricates a file. */
export async function checkPhotoIntegrity(): Promise<IntegrityReport> {
  const cfg = getConfig().photo;
  const report: IntegrityReport = { checked: 0, ok: 0, alerts: [], cursorReset: false };
  if (!(await storageHealthy())) {
    report.skipped = "storage unavailable";
    report.alerts.push({ photoId: "-", code: "PHOTO_STORAGE_UNAVAILABLE" });
    console.error("[mh02] CRITICAL PHOTO_STORAGE_UNAVAILABLE");
    return report;
  }
  try {
    await getPool();
  } catch {
    report.skipped = "database unavailable";
    return report;
  }
  // Only one process runs the check at a time (timeout 0: skip when someone else holds it).
  const gate = await withTransaction(async (tx) => {
    const g = await request(tx).query(
      `DECLARE @rc INT; EXEC @rc = sp_getapplock @Resource = N'photo-integrity-check', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 0; SELECT @rc AS rc;`
    );
    if (Number(g.recordset[0].rc) < 0) return null;
    let after = { at: "0001-01-01T00:00:00.000Z", id: "00000000-0000-0000-0000-000000000000" };
    try {
      after = JSON.parse(await readFile(cursorFile(), "utf8"));
    } catch {
      // no cursor: start from the beginning
    }
    const rows = await request(tx)
      .input("at", sql.DateTime2(0), new Date(after.at))
      .input("id", sql.UniqueIdentifier, after.id)
      .input("n", sql.Int, cfg.integrityBatchSize)
      .query(
        `SELECT TOP (@n) photo_id, storage_path, sha256, size_bytes, uploaded_at
         FROM dbo.transaction_photos WITH (READCOMMITTEDLOCK)
         WHERE uploaded_at > @at OR (uploaded_at = @at AND photo_id > @id)
         ORDER BY uploaded_at, photo_id`
      );
    return rows.recordset;
  }).catch(() => undefined);
  if (gate === undefined) {
    report.skipped = "database unavailable";
    return report;
  }
  if (gate === null) {
    report.skipped = "another process is running the check";
    return report;
  }
  const root = cfg.storageRoot;
  let missing = 0;
  for (const r of gate) {
    const photoId = uuid(r.photo_id);
    const row: PhotoRow = {
      photoId,
      activityId: "",
      storagePath: String(r.storage_path),
      sha256: String(r.sha256).trim().toLowerCase(),
      sizeBytes: Number(r.size_bytes),
      mimeType: "",
    };
    report.checked += 1;
    try {
      const finalFile = safeJoin(root, row.storagePath);
      const st = await stat(finalFile).catch((e: { code?: string }) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
      if (st) {
        if (st.size !== row.sizeBytes) {
          report.alerts.push({ photoId, code: "PHOTO_CORRUPT", storagePath: row.storagePath });
        } else if (cfg.integrityVerifyHash && !(await matchesRow(finalFile, row))) {
          report.alerts.push({ photoId, code: "PHOTO_CORRUPT", storagePath: row.storagePath });
        } else {
          report.ok += 1;
        }
        continue;
      }
      if ((await exists(uploadPath(photoId))) || (await exists(copyPath(photoId)))) {
        await finalizePhoto(photoId); // recoverable
        report.ok += 1;
        continue;
      }
      if (await exists(finalFile)) {
        report.ok += 1; // a finalizer just completed
        continue;
      }
      missing += 1;
      report.alerts.push({ photoId, code: "PHOTO_LOST", storagePath: row.storagePath });
    } catch {
      // Permission/I-O errors are unverifiable: retried next cycle, never counted as missing.
    }
  }
  if (gate.length > 0 && missing === gate.length) {
    // Every row missing = the volume, not the photos (wrong or empty mount).
    report.alerts = [{ photoId: "-", code: "PHOTO_STORAGE_UNAVAILABLE" }];
  }
  for (const a of report.alerts) console.error(`[mh02] CRITICAL ${a.code} ${a.photoId} ${a.storagePath ?? ""}`.trim());
  // Advance the cursor; reset it at the end of the data so the next cycle starts again from the beginning.
  if (gate.length < cfg.integrityBatchSize) {
    await unlink(cursorFile()).catch(() => undefined);
    report.cursorReset = true;
  } else {
    const last = gate[gate.length - 1];
    const tmp = `${cursorFile()}.tmp`;
    await writeFile(tmp, JSON.stringify({ at: (last.uploaded_at as Date).toISOString(), id: uuid(last.photo_id) }));
    await rename(tmp, cursorFile());
  }
  return report;
}

/* ------------------------------------------------------------------- reading */

export interface PhotoFile {
  path: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

/** Photo file for an authenticated user. Site is re-checked here (cross-Site = not found). */
export async function openPhoto(user: AuthUser, photoId: string): Promise<PhotoFile> {
  if (!PHOTO_ID_RE.test(photoId)) throw err.notFound("Photo not found.");
  const site = readSiteFilter(user);
  const pool = await getPool();
  const r = await request(pool)
    .input("id", sql.UniqueIdentifier, photoId)
    .input("site", sql.Int, site)
    .query(
      `SELECT p.storage_path, p.mime_type, p.size_bytes, p.original_filename
       FROM dbo.transaction_photos p INNER JOIN dbo.activities a ON a.activity_id = p.activity_id
       WHERE p.photo_id = @id AND (@site IS NULL OR a.site_id = @site)`
    );
  const row = r.recordset[0];
  if (!row) throw err.notFound("Photo not found.");
  const root = getConfig().photo.storageRoot;
  const finalFile = safeJoin(root, String(row.storage_path));
  // Until finalization completes the staging file is served (same Site check).
  const candidate = (await exists(finalFile)) ? finalFile : (await exists(uploadPath(photoId))) ? uploadPath(photoId) : (await exists(copyPath(photoId))) ? copyPath(photoId) : null;
  if (!candidate) throw err.notFound("The photo file is not available.");
  return {
    path: candidate,
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    filename: String(row.original_filename ?? `${photoId}`),
  };
}

export async function listPhotos(activityId: string, db?: Db): Promise<PhotoDto[]> {
  const conn = db ?? (await getPool());
  const r = await request(conn)
    .input("id", sql.UniqueIdentifier, activityId)
    .query(
      `SELECT photo_id, slot_key, caption, mime_type, size_bytes FROM dbo.transaction_photos WHERE activity_id = @id ORDER BY slot_key`
    );
  return r.recordset.map((p) => ({
    photoId: uuid(p.photo_id),
    slotKey: String(p.slot_key),
    caption: p.caption === null ? null : String(p.caption),
    mimeType: String(p.mime_type),
    sizeBytes: Number(p.size_bytes),
    url: `/api/photos/${uuid(p.photo_id)}`,
  }));
}

/** Rows of an activity's photos (for quarantine after a delete). */
export async function photoFilesOf(db: Db, activityId: string): Promise<{ photoId: string; storagePath: string }[]> {
  const r = await request(db)
    .input("id", sql.UniqueIdentifier, activityId)
    .query(`SELECT photo_id, storage_path FROM dbo.transaction_photos WHERE activity_id = @id`);
  return r.recordset.map((p) => ({ photoId: uuid(p.photo_id), storagePath: String(p.storage_path) }));
}

/* ------------------------------------------------------------ background jobs */

const globalJobs = globalThis as unknown as { __mh02PhotoJobs?: boolean };

/** Reconciler at start and every interval; integrity check on its own interval. Started once per process. */
export function startPhotoJobs(): void {
  const cfg = getConfig().photo;
  if (!cfg.backgroundJobs || globalJobs.__mh02PhotoJobs) return;
  globalJobs.__mh02PhotoJobs = true;
  const safe = (name: string, fn: () => Promise<unknown>) => () => {
    fn().catch((e: unknown) => console.error(`[mh02] photo job ${name} failed: ${(e as { code?: string }).code ?? (e as Error).name}`));
  };
  const reconcile = safe("reconcile", async () => {
    await ensureStorage();
    await reconcileStaging();
    await purgeQuarantine();
  });
  reconcile();
  setInterval(reconcile, cfg.reconcileIntervalMinutes * 60_000).unref();
  setInterval(safe("integrity", () => checkPhotoIntegrity()), cfg.integrityIntervalMinutes * 60_000).unref();
}
