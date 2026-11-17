// Request validation (zod). Body schemas are STRICT: unknown keys are rejected, which also rejects a
// client-supplied status, role, durationMinutes, timeZone or UTC offset (design 7).

import { z } from "zod";

export const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const uuidParam = z.string().regex(UUID_RE, "must be a UUID");

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const siteIdField = z.number().int().positive().optional();
const rowVersion = z.string().regex(/^0x[0-9a-fA-F]{16}$/, "rowVersion must look like 0x00000000000007D1");
const ipField = z.string().trim().max(45).regex(/^[0-9a-fA-F:.]+$/, "must be an IP address").optional();

export const loginSchema = z.object({ nrp: trimmed(30), password: z.string().min(1).max(200) }).strict();

/* ------------------------------------------------------------------ devices */

export const HEALTH = ["complete", "incomplete", "not_checked"] as const;
export const STATUS_CODES = ["in_use", "in_stock_rfu", "in_stock_damaged", "in_stock_ho"] as const;

export const createDeviceSchema = z
  .object({
    deviceCode: z.string().trim().regex(/^[A-Za-z0-9._-]{1,40}$/, "1-40 characters: letters, digits, . _ -"),
    serialNumber: trimmed(80),
    notes: optionalText(500),
    healthCheckStatus: z.enum(HEALTH).optional(),
    siteId: siteIdField,
  })
  .strict();

export const updateDeviceSchema = z
  .object({
    rowVersion,
    deviceCode: z.string().trim().regex(/^[A-Za-z0-9._-]{1,40}$/).optional(),
    serialNumber: trimmed(80).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    healthCheckStatus: z.enum(HEALTH).optional(),
  })
  .strict();

export const overrideDeviceSchema = z
  .object({
    rowVersion,
    status: z.enum(STATUS_CODES),
    unitNo: trimmed(30).nullable().optional(),
    reason: trimmed(500),
  })
  .strict();

export const archiveDeviceSchema = z.object({ rowVersion, reason: optionalText(500) }).strict();

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);
const optionalInt = z.coerce.number().int().positive().optional();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").optional();

export const deviceListQuery = z.object({
  page,
  pageSize,
  q: z.string().trim().max(80).optional(),
  status: z.enum(STATUS_CODES).optional(),
  equipmentType: z.string().trim().max(40).optional(),
  siteId: optionalInt,
  archived: z.enum(["true", "false"]).optional(),
  purpose: z.enum(["installable", "removable"]).optional(),
});

/* ------------------------------------------------------------- transactions */

const FINAL = z.enum(["in_stock_rfu", "in_stock_damaged", "in_stock_ho"]);
const SHIFT = z.enum(["Shift 1", "Shift 2"]).optional();

const common = {
  startedAt: z.string(),
  finishedAt: z.string(),
  shift: SHIFT,
  groupLeader: optionalText(120),
  remarks: optionalText(1000),
  siteId: siteIdField,
};

const network = {
  sourcePower: optionalText(60),
  spmVersion: optionalText(60),
  area: optionalText(60),
  locationDetail: optionalText(200),
  ipAddress: ipField,
  ipCpe: ipField,
  ipVhms: ipField,
};

export const installationSchema = z
  .object({ ...common, ...network, deviceCode: trimmed(40), unitNo: trimmed(30), notes: optionalText(1000) })
  .strict();

export const replacementSchema = z
  .object({
    ...common,
    ...network,
    oldDeviceCode: trimmed(40),
    newDeviceCode: trimmed(40),
    unitNo: trimmed(30),
    oldFinalCondition: FINAL,
  })
  .strict();

export const removalSchema = z
  .object({
    ...common,
    deviceCode: trimmed(40),
    unitNo: trimmed(30),
    reason: trimmed(200),
    reasonDetail: optionalText(1000),
    finalCondition: FINAL,
  })
  .strict();

export const COMPONENTS = ["MH02 Device", "GPS/Antenna", "Camera", "Wiring", "Speaker", "SPM", "CPE", "Firmware"] as const;

export const troubleshootSchema = z
  .object({
    ...common,
    deviceCode: trimmed(40),
    unitNo: trimmed(30).optional(),
    componentType: z.enum(COMPONENTS),
    issue: trimmed(1000),
    actionTaken: trimmed(1000),
    healthCheckResult: z.enum(["Pass", "Fail", "Verified", "Pending"]).optional(),
  })
  .strict();

export type InstallationInput = z.infer<typeof installationSchema>;
export type ReplacementInput = z.infer<typeof replacementSchema>;
export type RemovalInput = z.infer<typeof removalSchema>;
export type TroubleshootInput = z.infer<typeof troubleshootSchema>;
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type OverrideDeviceInput = z.infer<typeof overrideDeviceSchema>;
export type ArchiveDeviceInput = z.infer<typeof archiveDeviceSchema>;

export const activityListQuery = z.object({
  page,
  pageSize,
  type: z.enum(["installation", "replacement", "removal", "troubleshoot"]).optional(),
  dateFrom: ymd,
  dateTo: ymd,
  siteId: optionalInt,
  deviceCode: z.string().trim().max(40).optional(),
  unitNo: z.string().trim().max(30).optional(),
});

export const auditListQuery = z.object({
  page,
  pageSize,
  table: z.enum(["installation", "replacement", "removal", "troubleshoot", "device", "user_management"]).optional(),
  operation: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  action: z.string().trim().max(30).optional(),
  dateFrom: ymd,
  dateTo: ymd,
  siteId: optionalInt,
});

/* ------------------------------------------------------- transaction edit (PATCH) */

// A PATCH body is the creation body with every field optional, plus the concurrency token. `siteId` cannot be
// edited (design 3.9, rule 6), and strict mode still rejects status, duration, time zone and offsets.
export const editInstallationSchema = installationSchema.omit({ siteId: true }).partial().extend({ rowVersion }).strict();
export const editReplacementSchema = replacementSchema.omit({ siteId: true }).partial().extend({ rowVersion }).strict();
export const editRemovalSchema = removalSchema.omit({ siteId: true }).partial().extend({ rowVersion }).strict();
export const editTroubleshootSchema = troubleshootSchema.omit({ siteId: true }).partial().extend({ rowVersion }).strict();

/* -------------------------------------------------------------------------- users */

export const ROLE_CODES = ["superadmin", "user"] as const;
export const USER_STATUSES = ["active", "inactive"] as const;
/** Implementation default (not a business rule): minimum password length. */
export const PASSWORD_MIN = 10;
const passwordField = z.string().min(PASSWORD_MIN, `at least ${PASSWORD_MIN} characters`).max(200);
const nullableSite = z.number().int().positive().nullable().optional();

export const createUserSchema = z
  .object({
    nrp: z.string().trim().regex(/^[A-Za-z0-9._-]{3,30}$/, "3-30 characters: letters, digits, . _ -"),
    name: trimmed(120),
    email: z.string().trim().email().max(150).optional(),
    phone: z.string().trim().max(30).optional(),
    role: z.enum(ROLE_CODES),
    siteId: nullableSite,
    password: passwordField,
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: trimmed(120).optional(),
    email: z.string().trim().email().max(150).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    role: z.enum(ROLE_CODES).optional(),
    siteId: nullableSite,
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict();

export const resetPasswordSchema = z.object({ password: passwordField }).strict();

export const userListQuery = z.object({
  page,
  pageSize,
  q: z.string().trim().max(80).optional(),
  role: z.enum(ROLE_CODES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  siteId: optionalInt,
});

export const dashboardQuery = z.object({
  siteId: optionalInt,
  months: z.coerce.number().int().min(1).max(36).default(12),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
