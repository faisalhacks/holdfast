// W05a — engine/holds/duplicate. Signal detection.
//
// ─── Where this runs ─────────────────────────────────────────────────────────────────
//
// Over INVOICES, against the invoice ledger, BEFORE matching. Not over match candidates
// and not after a match fails.
//
// The common mistake is to model a duplicate as a match failure — two invoices competing
// for one payment, the loser held. That gets the control backwards in three ways. It can
// only fire once a payment exists, so the duplicate is caught after the money has moved
// rather than before. It cannot fire at all when the duplicate is caught early and no
// payment is ever made, which is the outcome the control exists to produce. And it makes
// the finding depend on the matcher's tolerances, so widening a tolerance would quietly
// dissolve a fraud control. Duplicate detection is an overpayment and fraud control over
// the payable ledger; the matcher is downstream of it and knows nothing about it.
//
// ─── The two flavours, and the third that only value opens ───────────────────────────
//
//   reference_repeat        the same invoice number posted twice for one vendor
//   vendor_amount_date      same vendor, same amount, same date, different numbers
//   vendor_amount_near_date same vendor, same amount, dates close but not equal
//
// The third is deliberately below the bar on its own — vendors bill the same amount in
// nearby weeks for perfectly ordinary reasons. It is raised only above the frozen amount
// cap, which is the whole point of the cap: recovery-audit work puts duplicate payments
// at a large share of claims and they concentrate in a few high-value invoices, so value,
// not signal strength, decides whether a person looks. The cap lives in
// eval/thresholds.json and arrives through HoldContext.policy; this file never names a
// rupee figure of its own.

import type { Invoice } from '@/lib/types';
import { arrivedAfter, canonicalReference, daysBetween } from './keys';
import { recurrenceSuppression, type RecurrenceSuppression } from './recurrence';

export type DuplicateSignalKind =
  | 'reference_repeat'
  | 'vendor_amount_date'
  | 'vendor_amount_near_date';

/** The field whose equality carried the signal. Becomes the conflict's `field_path`. */
export type DuplicateAxis = 'reference' | 'invoice_date' | 'received_date' | 'near_date';

export interface DuplicateSignal {
  readonly kind: DuplicateSignalKind;
  readonly axis: DuplicateAxis;
  /** The invoice that arrived FIRST. It is the payable; the subject is the copy. */
  readonly prior: Invoice;
  readonly amount_matches: boolean;
  /** Whole days between the two invoice dates, absolute. */
  readonly invoice_date_gap_days: number;
  /** Evidence that this collision is a legitimate cycle. Null means it is not. */
  readonly suppressed_by: RecurrenceSuppression | null;
  /** The subject sits above the frozen review cap. */
  readonly above_cap: boolean;
  /**
   * True when this signal would not clear the bar on its own and is only live because the
   * subject is above the cap. Recorded so the report can say how much the cap is doing.
   */
  readonly cap_escalated: boolean;
}

export interface DuplicatePolicy {
  readonly amount_cap_paise: number;
  readonly date_window_days: number;
}

/** A signal that should actually put a hold on the invoice. */
export function isLive(signal: DuplicateSignal): boolean {
  if (signal.suppressed_by !== null) return false;
  if (signal.kind === 'vendor_amount_near_date') return signal.above_cap;
  return true;
}

/**
 * Every duplicate signal against `subject`, strongest first, one per prior invoice per
 * axis. Suppression and cap escalation are recorded on the signal rather than applied by
 * dropping it, so the caller can report what the control considered and stood down on —
 * a suppression nobody can see is indistinguishable from a miss.
 */
export function detectDuplicateSignals(
  subject: Invoice,
  ledger: readonly Invoice[],
  policy: DuplicatePolicy
): readonly DuplicateSignal[] {
  // A credit note is a negative document. It cannot be overpaid, so it is neither a
  // duplicate nor the original of one, and holding it would block the very instrument
  // that corrects an overpayment.
  if (subject.is_credit_note) return [];

  const above_cap = subject.gross_paise > policy.amount_cap_paise;
  const subjectRef = canonicalReference(subject.reference);
  const signals: DuplicateSignal[] = [];

  for (const prior of ledger) {
    if (String(prior.id) === String(subject.id)) continue;
    if (prior.is_credit_note) continue;
    if (String(prior.vendor_id) !== String(subject.vendor_id)) continue;
    // Only the copy that arrived second is held. The first is a payable the business owes.
    if (!arrivedAfter(subject, prior)) continue;

    const amount_matches = prior.gross_paise === subject.gross_paise;
    const gapRaw = daysBetween(prior.invoice_date, subject.invoice_date);
    const gap = gapRaw === null ? Number.MAX_SAFE_INTEGER : Math.abs(gapRaw);
    const suppression = recurrenceSuppression(prior, subject, ledger);

    const base = {
      prior,
      amount_matches,
      invoice_date_gap_days: gap,
      above_cap,
    } as const;

    // 1. Same invoice number, same vendor. The strongest signal in AP and the one Oracle
    //    Payables keys its own duplicate check on. Never suppressed: a recurring biller
    //    issues a NEW number every cycle, so a repeated number inside a recurring stream
    //    is a re-post, not a cycle.
    const priorRef = canonicalReference(prior.reference);
    if (subjectRef !== '' && priorRef === subjectRef) {
      signals.push({
        ...base,
        kind: 'reference_repeat',
        axis: 'reference',
        suppressed_by: null,
        cap_escalated: false,
      });
    }

    if (!amount_matches) continue;

    // 2. Same vendor, same amount, same date. Both date axes count: a duplicate may be
    //    re-keyed with the original document date and posted later, or keyed afresh and
    //    posted the same day as its twin. Checking only one axis misses half of them.
    if (prior.invoice_date === subject.invoice_date) {
      signals.push({
        ...base,
        kind: 'vendor_amount_date',
        axis: 'invoice_date',
        suppressed_by: suppression,
        cap_escalated: false,
      });
      continue;
    }
    if (prior.received_date === subject.received_date) {
      signals.push({
        ...base,
        kind: 'vendor_amount_date',
        axis: 'received_date',
        suppressed_by: suppression,
        cap_escalated: false,
      });
      continue;
    }

    // 3. Same vendor, same amount, dates near but not equal. Below the bar on its own;
    //    above the cap, value decides and a person looks.
    if (gap <= policy.date_window_days) {
      signals.push({
        ...base,
        kind: 'vendor_amount_near_date',
        axis: 'near_date',
        suppressed_by: suppression,
        cap_escalated: above_cap,
      });
    }
  }

  const strength: Readonly<Record<DuplicateSignalKind, number>> = {
    reference_repeat: 0,
    vendor_amount_date: 1,
    vendor_amount_near_date: 2,
  };
  return signals.sort((a, b) => {
    if (strength[a.kind] !== strength[b.kind]) return strength[a.kind] - strength[b.kind];
    return String(a.prior.id) < String(b.prior.id) ? -1 : 1;
  });
}
