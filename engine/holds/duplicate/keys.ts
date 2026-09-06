// W05a — engine/holds/duplicate. Keys, dates and ledger order.
//
// Everything here is computed from RAW invoice columns. This family never reads
// `normalised_reference`, `narration_normalised` or any `*_extracted` field: recovering
// those values is a different worker's job and is the thing being measured. Duplicate
// detection has to work on what the ledger actually holds the moment an invoice arrives,
// which is the raw document — that is also why it runs BEFORE matching rather than after.

import type { Invoice } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Reference canonicalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapses a raw reference to the characters a human would compare: letters and digits,
 * upper-cased. `TX/06398`, `tx-06398` and `TX 06398` are the same invoice number written
 * three ways, and an AP clerk re-keying a document is exactly where that variation comes
 * from. Nothing else is done — no leading-zero strip, no prefix strip — because those
 * rewrites merge genuinely different documents and a duplicate control that over-merges
 * holds invoices that are fine.
 */
export function canonicalReference(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charAt(i).toUpperCase();
    const isAlpha = ch >= 'A' && ch <= 'Z';
    const isDigit = ch >= '0' && ch <= '9';
    if (isAlpha || isDigit) out += ch;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Civil dates
// ─────────────────────────────────────────────────────────────────────────────

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  /** Day of month, 1-31. */
  readonly day: number;
  /** Days since 1970-01-01. Signed, exact, no timezone. */
  readonly serial: number;
  /** `year * 12 + (month - 1)`. Month arithmetic without calendar drift. */
  readonly month_index: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Days since the civil epoch. Hinnant's algorithm — integer only, no Date, no timezone. */
function serialOf(y: number, m: number, d: number): number {
  const shifted = m <= 2 ? y - 1 : y;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Parses `YYYY-MM-DD`. Returns null on anything else rather than guessing. */
export function civilDate(iso: string): CivilDate | null {
  if (!ISO_DATE.test(iso)) return null;
  const year = parseInt(iso.slice(0, 4), 10);
  const month = parseInt(iso.slice(5, 7), 10);
  const day = parseInt(iso.slice(8, 10), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, serial: serialOf(year, month, day), month_index: year * 12 + (month - 1) };
}

/** Whole days between two ISO dates, `b` minus `a`. Null when either is unparseable. */
export function daysBetween(a: string, b: string): number | null {
  const ca = civilDate(a);
  const cb = civilDate(b);
  if (!ca || !cb) return null;
  return cb.serial - ca.serial;
}

/** Whole calendar months between two ISO dates, `b` minus `a`. */
export function monthsBetween(a: string, b: string): number | null {
  const ca = civilDate(a);
  const cb = civilDate(b);
  if (!ca || !cb) return null;
  return cb.month_index - ca.month_index;
}

/** Day-of-month drift between two ISO dates. A monthly bill lands on or near one day. */
export function dayOfMonthDrift(a: string, b: string): number | null {
  const ca = civilDate(a);
  const cb = civilDate(b);
  if (!ca || !cb) return null;
  return Math.abs(cb.day - ca.day);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A total order over the ledger by ARRIVAL, not by document date.
 *
 * This matters more than it looks. A duplicate is the copy that arrives second, and the
 * hold belongs on that one: the first copy is a payable the business genuinely owes, and
 * holding both would stop a legitimate payment in order to stop an illegitimate one.
 * Received date is the arrival fact; `created_at` breaks a same-day tie (two months posted
 * in one batch share a received date); the id breaks the remaining tie so the result never
 * depends on the order the ledger happened to be loaded in.
 */
export function arrivalRank(inv: Invoice): readonly [number, string, string] {
  const rcv = civilDate(inv.received_date);
  return [rcv ? rcv.serial : Number.MAX_SAFE_INTEGER, String(inv.created_at), String(inv.id)];
}

/** True when `later` arrived strictly after `earlier`. */
export function arrivedAfter(later: Invoice, earlier: Invoice): boolean {
  const l = arrivalRank(later);
  const e = arrivalRank(earlier);
  if (l[0] !== e[0]) return l[0] > e[0];
  if (l[1] !== e[1]) return l[1] > e[1];
  return l[2] > e[2];
}
