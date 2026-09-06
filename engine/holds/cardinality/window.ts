// W05c — the date window.
//
// `policy.date_window_days` is the outer bound on the cardinality search, and it is a
// correctness bound before it is a performance one. Unbounded subset-sum over a full
// ledger is intractable; it is also wrong. A payment settling an invoice from six months
// earlier is an exception a human should see, not a match to find, and a search that
// reaches for it will find a spurious one long before it finds the real one.
//
// The window is applied SYMMETRICALLY around the invoice date. `DateEvidence.delta` in
// the contract is explicitly signed and advance remittances appear in the statement feed,
// so a payment dated before its invoice is in scope; a payment dated a year either side
// is not.

import type { Days, IsoDate } from '@/lib/types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * Whole days since the epoch, or null when the value is not a calendar date.
 *
 * Parsed by hand and round-tripped rather than handed to `new Date(string)`: the latter
 * accepts `2026-02-31` and silently rolls it into March, which would move a payment into
 * a window it does not belong in.
 */
export function dayIndex(value: string): number | null {
  const parts = ISO_DATE.exec(value);
  if (!parts) return null;
  const year = Number.parseInt(parts[1] ?? '', 10);
  const month = Number.parseInt(parts[2] ?? '', 10);
  const day = Number.parseInt(parts[3] ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const stamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(stamp)) return null;
  const roundTrip = new Date(stamp);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.round(stamp / MS_PER_DAY);
}

/** Signed whole days: `later` minus `earlier`. Null when either side is unparseable. */
export function dayDelta(later: IsoDate, earlier: IsoDate): Days | null {
  const a = dayIndex(later);
  const b = dayIndex(earlier);
  if (a === null || b === null) return null;
  return a - b;
}

/** A payment is in scope when it falls within `windowDays` either side of the invoice. */
export function insideWindow(
  paymentDate: IsoDate,
  invoiceDate: IsoDate,
  windowDays: number
): boolean {
  const delta = dayDelta(paymentDate, invoiceDate);
  if (delta === null) return false;
  const bound = Number.isSafeInteger(windowDays) && windowDays >= 0 ? windowDays : 0;
  return delta <= bound && delta >= -bound;
}
