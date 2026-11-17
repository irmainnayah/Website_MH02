// Time zone handling (design 3.9, "Time zone strategy"). Pure functions, built-in Intl only.
// The backend ALWAYS derives the UTC offset from the transaction Site's IANA zone; a client never
// supplies an offset or zone. Local input is a wall-clock string "YYYY-MM-DDTHH:mm" without Z/offset.

import { err } from "./errors.ts";

/** Allowed Indonesian zones (configurable list in the design) and their labels. */
const ZONE_LABELS: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

export function isAllowedZone(zone: string): boolean {
  return Object.prototype.hasOwnProperty.call(ZONE_LABELS, zone);
}

export function zoneLabel(zone: string): string {
  return ZONE_LABELS[zone] ?? zone;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Parse a local wall-clock string. Strings with "Z" or an offset are rejected (400). */
export function parseLocalDateTime(input: string, field = "dateTime"): LocalParts {
  if (typeof input !== "string") {
    throw err.badRequest("INVALID_DATETIME", `${field} must be a string like 2026-10-20T22:30.`);
  }
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(input) && !LOCAL_PATTERN.test(input)) {
    throw err.badRequest("OFFSET_NOT_ALLOWED", `${field} must be local time without Z or UTC offset.`);
  }
  const m = LOCAL_PATTERN.exec(input);
  if (!m) {
    throw err.badRequest("INVALID_DATETIME", `${field} must look like 2026-10-20T22:30 (local time, no offset).`);
  }
  const parts: LocalParts = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() !== parts.month - 1 ||
    check.getUTCDate() !== parts.day ||
    check.getUTCHours() !== parts.hour ||
    check.getUTCMinutes() !== parts.minute
  ) {
    throw err.badRequest("INVALID_DATETIME", `${field} is not a real calendar date and time.`);
  }
  return parts;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(zone, f);
  }
  return f;
}

/** Offset (minutes east of UTC) of an IANA zone at a UTC instant. */
export function offsetMinutesAt(utcMs: number, zone: string): number {
  const parts = formatterFor(zone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const wholeSecondUtc = Math.floor(utcMs / 1000) * 1000;
  return Math.round((localAsUtc - wholeSecondUtc) / 60000);
}

export interface ResolvedLocalTime {
  utcMs: number;
  offsetMinutes: number;
}

/**
 * Convert a local wall-clock time in `zone` to a UTC instant and the zone offset at that instant.
 * A non-existent (DST gap) or ambiguous (DST overlap) local time is rejected.
 */
export function localToUtc(local: LocalParts, zone: string): ResolvedLocalTime {
  if (!isAllowedZone(zone)) {
    throw err.unprocessable("UNSUPPORTED_ZONE", `Time zone ${zone} is not allowed.`);
  }
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const candidates = new Set<number>();
  for (const probe of [naive - 86_400_000, naive, naive + 86_400_000]) {
    const offset = offsetMinutesAt(probe, zone);
    const utc = naive - offset * 60_000;
    if (offsetMinutesAt(utc, zone) === offset) {
      candidates.add(utc);
    }
  }
  if (candidates.size === 0) {
    throw err.badRequest("NONEXISTENT_LOCAL_TIME", "That local time does not exist in the Site's time zone.");
  }
  if (candidates.size > 1) {
    throw err.badRequest("AMBIGUOUS_LOCAL_TIME", "That local time is ambiguous in the Site's time zone.");
  }
  const utcMs = [...candidates][0];
  return { utcMs, offsetMinutes: offsetMinutesAt(utcMs, zone) };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** ISO 8601 with offset, e.g. 2026-10-20T22:30:00+08:00 (local time of the activity's Site). */
export function formatWithOffset(utcMs: number, offsetMinutes: number): string {
  const d = new Date(utcMs + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Local calendar date (YYYY-MM-DD) of a UTC instant at a given offset. */
export function localDate(utcMs: number, offsetMinutes: number): string {
  const d = new Date(utcMs + offsetMinutes * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local year+month (YYYYMM) used in form numbers. */
export function localYearMonth(utcMs: number, offsetMinutes: number): string {
  return localDate(utcMs, offsetMinutes).slice(0, 7).replace("-", "");
}

/** Whole minutes between two instants; must equal SQL DATEDIFF(MINUTE, ...) for whole-minute inputs. */
export function durationMinutes(startUtcMs: number, endUtcMs: number): number {
  return Math.round((endUtcMs - startUtcMs) / 60_000);
}
