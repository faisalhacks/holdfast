// W04b — calendar arithmetic.
//
// No clock, no locale, no timezone. An `IsoDate` is `YYYY-MM-DD` and the only thing this
// module does with one is turn it into a whole count of days since the epoch, in UTC, so
// that two dates can be subtracted. A matcher that reads the system clock produces a
// different answer tomorrow for the same frozen input, which would make every sweep result
// unreproducible for a reason no run records.
//
// A malformed or absent date yields `null` and the caller decides. It is never silently
// treated as today.

import type { Days, IsoDate } from '@/lib/types';

const ISO_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Whole days since 1970-01-01 UTC, or null when the value is not a calendar date. */
export function dayIndex(value: IsoDate | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const m = ISO_DATE_SHAPE.exec(value);
  if (m === null) return null;
  const y = m[1];
  const mo = m[2];
  const d = m[3];
  if (y === undefined || mo === undefined || d === undefined) return null;
  const year = Number.parseInt(y, 10);
  const month = Number.parseInt(mo, 10);
  const day = Number.parseInt(d, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms)) return null;
  const index = Math.round(ms / MS_PER_DAY);
  // Round-trips only for a real calendar date; 2026-02-31 does not.
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null;
  }
  return index;
}

/** `to - from` in whole days, signed. Null when either side is not a calendar date. */
export function dayDelta(from: number | null, to: number | null): Days | null {
  if (from === null || to === null) return null;
  return to - from;
}
