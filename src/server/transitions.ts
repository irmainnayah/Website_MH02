// Device status transition rules (design 6, Revision 11). Pure functions: given the facts read
// (under row lock) inside the SQL transaction, they either return the before/after device state or
// throw a business-rule error. Troubleshoot never changes the device.

import { err } from "./errors.ts";

export const STATUS = {
  in_use: 1,
  in_stock_rfu: 2,
  in_stock_damaged: 3,
  in_stock_ho: 4,
} as const;

export type StatusCode = keyof typeof STATUS;
export type FinalCondition = "in_stock_rfu" | "in_stock_damaged" | "in_stock_ho";
export const FINAL_CONDITIONS: readonly FinalCondition[] = ["in_stock_rfu", "in_stock_damaged", "in_stock_ho"];

export function finalStatusId(condition: FinalCondition): number {
  return STATUS[condition];
}

export function isStockStatus(statusId: number): boolean {
  return statusId === 2 || statusId === 3 || statusId === 4;
}

export interface DeviceState {
  statusId: number;
  unitId: string | null;
  locationSiteId: number | null;
  /** YYYY-MM-DD */
  lastMaintenanceDate: string | null;
}

export interface DeviceFacts extends DeviceState {
  deviceId: string;
  deviceCode: string;
  siteId: number;
  isDeleted: boolean;
}

export interface UnitFacts {
  unitId: string;
  unitNo: string;
  siteId: number;
  isActive: boolean;
  /** device_id of the device currently installed on this unit, if any */
  occupiedByDeviceId: string | null;
}

export interface Plan {
  before: DeviceState;
  after: DeviceState;
}

function stateOf(d: DeviceFacts): DeviceState {
  return {
    statusId: d.statusId,
    unitId: d.unitId,
    locationSiteId: d.locationSiteId,
    lastMaintenanceDate: d.lastMaintenanceDate,
  };
}

function requireUsable(device: DeviceFacts, txSiteId: number): void {
  if (device.isDeleted) {
    throw err.unprocessable("DEVICE_ARCHIVED", `Device ${device.deviceCode} is archived.`);
  }
  if (device.siteId !== txSiteId) {
    // Cross-Site use is never allowed (no transfer feature).
    throw err.unprocessable("DEVICE_SITE_MISMATCH", `Device ${device.deviceCode} belongs to another Site.`);
  }
}

function requireUnit(unit: UnitFacts | null, txSiteId: number, allowOccupiedBy: string | null): UnitFacts {
  if (!unit) {
    throw err.unprocessable("UNIT_NOT_FOUND", "The Unit does not exist.");
  }
  if (!unit.isActive) {
    throw err.unprocessable("UNIT_INACTIVE", `Unit ${unit.unitNo} is not active.`);
  }
  if (unit.siteId !== txSiteId) {
    throw err.unprocessable("UNIT_SITE_MISMATCH", `Unit ${unit.unitNo} belongs to another Site.`);
  }
  if (unit.occupiedByDeviceId !== null && unit.occupiedByDeviceId !== allowOccupiedBy) {
    throw err.unprocessable("UNIT_OCCUPIED", `Unit ${unit.unitNo} already has a device installed.`);
  }
  return unit;
}

/** Installation: In Stock RFU -> In Use on a free Unit of the same Site. */
export function planInstallation(
  device: DeviceFacts,
  unit: UnitFacts | null,
  txSiteId: number,
  finishedLocalDate: string,
  allowOccupiedBy: string | null = null
): Plan {
  requireUsable(device, txSiteId);
  if (device.statusId !== STATUS.in_stock_rfu) {
    throw err.unprocessable(
      "DEVICE_NOT_AVAILABLE",
      `Device ${device.deviceCode} is not In Stock RFU and cannot be installed.`
    );
  }
  const u = requireUnit(unit, txSiteId, allowOccupiedBy);
  return {
    before: stateOf(device),
    after: {
      statusId: STATUS.in_use,
      unitId: u.unitId,
      locationSiteId: u.siteId,
      lastMaintenanceDate: finishedLocalDate,
    },
  };
}

/** Removal: In Use -> chosen stock condition; Unit cleared; location unchanged (decision Q5). */
export function planRemoval(
  device: DeviceFacts,
  unit: UnitFacts | null,
  txSiteId: number,
  condition: FinalCondition,
  finishedLocalDate: string
): Plan {
  requireUsable(device, txSiteId);
  if (device.statusId !== STATUS.in_use) {
    throw err.unprocessable("DEVICE_NOT_IN_USE", `Device ${device.deviceCode} is not In Use.`);
  }
  if (!unit) {
    throw err.unprocessable("UNIT_NOT_FOUND", "The Unit does not exist.");
  }
  if (device.unitId !== unit.unitId) {
    throw err.unprocessable("UNIT_MISMATCH", `Device ${device.deviceCode} is not installed on Unit ${unit.unitNo}.`);
  }
  return {
    before: stateOf(device),
    after: {
      statusId: finalStatusId(condition),
      unitId: null,
      locationSiteId: device.locationSiteId,
      lastMaintenanceDate: finishedLocalDate,
    },
  };
}

/** Replacement: the old device is removed (to `condition`), the new device is installed on the SAME Unit. */
export function planReplacement(
  oldDevice: DeviceFacts,
  newDevice: DeviceFacts,
  unit: UnitFacts | null,
  txSiteId: number,
  oldCondition: FinalCondition,
  finishedLocalDate: string
): { old: Plan; new: Plan } {
  if (oldDevice.deviceId === newDevice.deviceId) {
    throw err.unprocessable("SAME_DEVICE", "The old and the replacement device must be different.");
  }
  const oldPlan = planRemoval(oldDevice, unit, txSiteId, oldCondition, finishedLocalDate);
  const newPlan = planInstallation(newDevice, unit, txSiteId, finishedLocalDate, oldDevice.deviceId);
  return { old: oldPlan, new: newPlan };
}

/** Troubleshoot: validates the device only; the state is unchanged (no status rule is defined). */
export function planTroubleshoot(device: DeviceFacts, txSiteId: number): Plan {
  requireUsable(device, txSiteId);
  const s = stateOf(device);
  return { before: s, after: { ...s } };
}

export interface OverrideTarget {
  statusId: number;
  unitId: string | null;
}

/**
 * Super Admin override of status/Unit (design 6). Keeps the invariant "In Use <=> has a Unit".
 * Location, last maintenance date and health check are NOT touched (decision Q16).
 */
export function planOverride(device: DeviceFacts, target: OverrideTarget, unit: UnitFacts | null): Plan {
  if (device.isDeleted) {
    throw err.unprocessable("DEVICE_ARCHIVED", `Device ${device.deviceCode} is archived.`);
  }
  if (![1, 2, 3, 4].includes(target.statusId)) {
    throw err.unprocessable("INVALID_STATUS", "Unknown device status.");
  }
  if (target.statusId === STATUS.in_use) {
    if (!target.unitId) {
      throw err.unprocessable("UNIT_REQUIRED", "An In Use device needs a Unit.");
    }
    requireUnit(unit, device.siteId, device.deviceId);
  } else if (target.unitId) {
    throw err.unprocessable("UNIT_NOT_ALLOWED", "A stock status cannot have a Unit.");
  }
  if (device.statusId === target.statusId && device.unitId === target.unitId) {
    throw err.unprocessable("OVERRIDE_NO_CHANGE", "Nothing would change.");
  }
  return {
    before: stateOf(device),
    after: {
      statusId: target.statusId,
      unitId: target.unitId,
      locationSiteId: device.locationSiteId,
      lastMaintenanceDate: device.lastMaintenanceDate,
    },
  };
}

/** Archive (soft delete): refused while In Use (decision Q17) or when already archived. */
export function checkArchivable(device: DeviceFacts): void {
  if (device.isDeleted) {
    throw err.conflict("DEVICE_ALREADY_ARCHIVED", "The device is already archived.");
  }
  if (device.statusId === STATUS.in_use) {
    throw err.conflict("DEVICE_IN_USE", "An In Use device cannot be archived. Remove it from its Unit first.");
  }
}

/** Check 0 of the Edit/Delete rule: the device must still equal this activity's after-snapshot. */
export function matchesAfterSnapshot(current: DeviceState, after: DeviceState): boolean {
  return (
    current.statusId === after.statusId &&
    current.unitId === after.unitId &&
    current.locationSiteId === after.locationSiteId &&
    current.lastMaintenanceDate === after.lastMaintenanceDate
  );
}
