// W05a — engine/holds/duplicate. Recurring and instalment suppression.
//
// ─── Why this file is the hard half ──────────────────────────────────────────────────
//
// Finding two invoices with the same vendor, amount and date is trivial. The reason
// duplicate detection has a bad name in AP is the other side of it: rent, retainers,
// AMC fees, licence subscriptions and instalment plans all produce a stream of documents
// that are, by design, identical on vendor and amount. A control that flags them holds a
// dozen legitimate invoices a month, the AP team learns to click through the queue, and
// the one real duplicate goes through with everything else. Alert fatigue is not a UX
// problem here; it is the failure mode of the control itself.
//
// ─── The rule, and why it is not "trust the flag" ────────────────────────────────────
//
// `Invoice.recurrence` is a declaration on the document. Treating it as sufficient would
// make the control trivially defeatable — anything wearing the badge walks past. So the
// flag is necessary and NOT sufficient. Suppression requires the flag to be corroborated
// by an observable SERIES in the ledger:
//
//   1. three or more documents at the same vendor, same gross amount, same declared kind
//   2. every member in a DIFFERENT accounting period — two documents in one period are
//      not two cycles of anything
//   3. every member carrying a DISTINCT reference — a repeated reference is a re-post,
//      never a cycle; a real recurring biller issues a new invoice number each time
//   4. consecutive invoice dates forming a REGULAR cadence for the declared kind
//
// The fourth condition is what makes this self-defending. Inserting a duplicate into a
// recurring stream breaks the cadence it would have to hide behind: the extra document
// either lands in a period that already has one, or off the step. When that happens the
// series stops being regular and suppression collapses for the WHOLE series — every
// member goes back to being checked. That is the safe direction to fail in, and it is
// the difference between a suppression rule and a hole.
//
// Suppression NEVER applies to a repeated reference. That path is in detect.ts and it is
// unconditional.

import type { Invoice, Paise, VendorId } from '@/lib/types';
import { canonicalReference, civilDate, daysBetween, dayOfMonthDrift, monthsBetween } from './keys';

export type RecurrenceKind = NonNullable<Invoice['recurrence']>;

/** A declared cadence has to be observed at least this many times before it is believed. */
export const SERIES_MIN_MEMBERS = 3;

/** A monthly or quarterly bill lands on or near the same day of the month. */
export const CADENCE_DAY_DRIFT_MAX = 3;

/**
 * Two instalments of one plan are never days apart. Below this, an "instalment" at the
 * same amount is a re-post wearing a schedule.
 */
export const INSTALMENT_MIN_GAP_DAYS = 20;

export interface RecurringSeries {
  readonly vendor_id: VendorId;
  readonly gross_paise: Paise;
  readonly kind: RecurrenceKind;
  /** Members sorted by invoice date, ascending. */
  readonly members: readonly Invoice[];
  /** Every member in its own accounting period. */
  readonly periods_distinct: boolean;
  /** Every member carrying its own reference. */
  readonly references_distinct: boolean;
  /** Consecutive invoice dates step at the declared cadence. */
  readonly cadence_regular: boolean;
  /** All four conditions above. Only a corroborated series may suppress anything. */
  readonly corroborated: boolean;
}

export interface RecurrenceSuppression {
  readonly kind: RecurrenceKind;
  readonly series_size: number;
  /** The step between the two documents, in whole calendar months (0 for instalments). */
  readonly months_apart: number;
  readonly days_apart: number;
  readonly prior_period: string;
  readonly subject_period: string;
}

function sortedByInvoiceDate(rows: readonly Invoice[]): readonly Invoice[] {
  return [...rows].sort((a, b) => {
    const ca = civilDate(a.invoice_date);
    const cb = civilDate(b.invoice_date);
    const sa = ca ? ca.serial : 0;
    const sb = cb ? cb.serial : 0;
    if (sa !== sb) return sa - sb;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
}

function stepMatchesKind(kind: RecurrenceKind, earlier: Invoice, later: Invoice): boolean {
  const days = daysBetween(earlier.invoice_date, later.invoice_date);
  if (days === null || days <= 0) return false;

  if (kind === 'instalment') return days >= INSTALMENT_MIN_GAP_DAYS;

  const months = monthsBetween(earlier.invoice_date, later.invoice_date);
  const drift = dayOfMonthDrift(earlier.invoice_date, later.invoice_date);
  if (months === null || drift === null) return false;
  if (drift > CADENCE_DAY_DRIFT_MAX) return false;
  if (kind === 'monthly') return months >= 1;
  return months >= 3 && months % 3 === 0;
}

function consecutiveStepIsExact(kind: RecurrenceKind, earlier: Invoice, later: Invoice): boolean {
  if (kind === 'instalment') return stepMatchesKind(kind, earlier, later);
  const months = monthsBetween(earlier.invoice_date, later.invoice_date);
  const drift = dayOfMonthDrift(earlier.invoice_date, later.invoice_date);
  if (months === null || drift === null) return false;
  if (drift > CADENCE_DAY_DRIFT_MAX) return false;
  return kind === 'monthly' ? months === 1 : months === 3;
}

/**
 * Builds the series a document belongs to: same vendor, same gross amount, same declared
 * cadence. Credit notes are excluded — a credit note is a negative document and cannot be
 * overpaid, so it is neither a duplicate nor a cycle.
 */
export function seriesFor(
  subject: Invoice,
  ledger: readonly Invoice[]
): RecurringSeries | null {
  const kind = subject.recurrence;
  if (kind === null || subject.is_credit_note) return null;

  const seen = new Set<string>([String(subject.id)]);
  const members: Invoice[] = [subject];
  for (const row of ledger) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    if (row.is_credit_note) continue;
    if (row.recurrence !== kind) continue;
    if (String(row.vendor_id) !== String(subject.vendor_id)) continue;
    if (row.gross_paise !== subject.gross_paise) continue;
    seen.add(id);
    members.push(row);
  }

  const ordered = sortedByInvoiceDate(members);

  const periods = new Set<string>();
  const references = new Set<string>();
  for (const m of ordered) {
    periods.add(m.period);
    references.add(canonicalReference(m.reference));
  }
  const periods_distinct = periods.size === ordered.length;
  const references_distinct = references.size === ordered.length;

  let cadence_regular = ordered.length >= 2;
  for (let i = 1; i < ordered.length; i += 1) {
    const earlier = ordered[i - 1];
    const later = ordered[i];
    if (!earlier || !later || !consecutiveStepIsExact(kind, earlier, later)) {
      cadence_regular = false;
      break;
    }
  }

  return {
    vendor_id: subject.vendor_id,
    gross_paise: subject.gross_paise,
    kind,
    members: ordered,
    periods_distinct,
    references_distinct,
    cadence_regular,
    corroborated:
      ordered.length >= SERIES_MIN_MEMBERS &&
      periods_distinct &&
      references_distinct &&
      cadence_regular,
  };
}

/**
 * Decides whether a vendor+amount+date collision between two documents is a cycle of a
 * legitimate recurring or instalment stream rather than a duplicate.
 *
 * Returns the evidence when it is, and null when it is not. Null is the default: an
 * undeclared, uncorroborated or off-cadence pair is never suppressed.
 */
export function recurrenceSuppression(
  prior: Invoice,
  subject: Invoice,
  ledger: readonly Invoice[]
): RecurrenceSuppression | null {
  const kind = subject.recurrence;
  if (kind === null || prior.recurrence !== kind) return null;
  if (prior.is_credit_note || subject.is_credit_note) return null;
  if (String(prior.vendor_id) !== String(subject.vendor_id)) return null;

  // Same document date, same period, or the same reference: none of these is a cycle,
  // whatever the flag says.
  if (prior.invoice_date === subject.invoice_date) return null;
  if (prior.period === subject.period) return null;
  if (canonicalReference(prior.reference) === canonicalReference(subject.reference)) return null;

  const ordered = [prior, subject];
  const first = ordered[0];
  const second = ordered[1];
  if (!first || !second) return null;
  const days = daysBetween(first.invoice_date, second.invoice_date);
  if (days === null) return null;
  const earlier = days >= 0 ? first : second;
  const later = days >= 0 ? second : first;
  if (!stepMatchesKind(kind, earlier, later)) return null;

  const series = seriesFor(subject, ledger);
  if (!series || !series.corroborated) return null;
  const ids = new Set(series.members.map((m) => String(m.id)));
  if (!ids.has(String(prior.id))) return null;

  const months = monthsBetween(earlier.invoice_date, later.invoice_date);
  return {
    kind,
    series_size: series.members.length,
    months_apart: kind === 'instalment' ? 0 : months ?? 0,
    days_apart: Math.abs(days),
    prior_period: prior.period,
    subject_period: subject.period,
  };
}
