// W05a — engine/holds/duplicate. Conflicts.
//
// A Conflict is the machine-readable reason a hold fired, and the contract is explicit
// that `clause` is a SHORT FIXED PHRASE, not generated prose. So the phrases live in a
// frozen table here and nothing interpolates into them. Document ids, gaps and periods
// are data and belong in the proposal's `reason`, not inside a sentence.
//
// `applyAll()` throws on a proposal with an empty conflict array. That is not a nuisance
// to be routed around — a held invoice with no stated reason is one a reviewer cannot act
// on, and a hold that fails to serialise is an invoice that gets paid. Every path in this
// file that can raise a hold produces at least one conflict by construction.

import type { Conflict, ConflictSeverity, FieldPath } from '@/lib/types';
import type { DuplicateSignal } from './detect';

const path = (p: string): FieldPath => p as FieldPath;

/** Exact phrases. Fixed, short, and never assembled from parts. */
export const DUPLICATE_CLAUSES = Object.freeze({
  reference_repeat_same_amount:
    'The same invoice reference is already posted for this vendor at the same amount.',
  reference_repeat_other_amount:
    'The same invoice reference is already posted for this vendor at a different amount.',
  vendor_amount_invoice_date: 'A prior invoice matches on vendor, amount and invoice date.',
  vendor_amount_received_date: 'A prior invoice matches on vendor, amount and received date.',
  vendor_amount_near_date: 'A prior invoice matches on vendor and amount within the date window.',
  amount_over_cap: 'Invoice value is above the review cap; a named reviewer must act on it.',
});

const FIELD_PATHS: Readonly<Record<DuplicateSignal['axis'], FieldPath>> = Object.freeze({
  reference: path('invoice.reference'),
  invoice_date: path('invoice.invoice_date'),
  received_date: path('invoice.received_date'),
  near_date: path('invoice.invoice_date'),
});

function clauseFor(signal: DuplicateSignal): string {
  if (signal.kind === 'reference_repeat') {
    return signal.amount_matches
      ? DUPLICATE_CLAUSES.reference_repeat_same_amount
      : DUPLICATE_CLAUSES.reference_repeat_other_amount;
  }
  if (signal.kind === 'vendor_amount_near_date') return DUPLICATE_CLAUSES.vendor_amount_near_date;
  return signal.axis === 'received_date'
    ? DUPLICATE_CLAUSES.vendor_amount_received_date
    : DUPLICATE_CLAUSES.vendor_amount_invoice_date;
}

/**
 * Severity per signal. `duplicate_candidate` is never auto-releasable and always blocks
 * accounting, whatever this says — the registry owns that and this family does not get a
 * vote. Severity drives the order a human works the queue in, nothing more.
 *
 * A repeated reference at a DIFFERENT amount is graded `material` rather than `blocking`:
 * it is a real duplicate signal and gets held, but a re-key with a changed amount is more
 * often a corrected re-issue than a second claim on the same money.
 */
export function severityFor(signal: DuplicateSignal): ConflictSeverity {
  if (signal.kind === 'reference_repeat' && !signal.amount_matches) return 'material';
  return 'blocking';
}

export function conflictFor(signal: DuplicateSignal): Conflict {
  return {
    code: signal.kind === 'reference_repeat' ? 'duplicate_reference' : 'duplicate_vendor_amount_date',
    field_path: FIELD_PATHS[signal.axis],
    clause: clauseFor(signal),
    severity: severityFor(signal),
  };
}

export function capConflict(): Conflict {
  return {
    code: 'amount_over_cap',
    field_path: path('invoice.gross_paise'),
    clause: DUPLICATE_CLAUSES.amount_over_cap,
    severity: 'blocking',
  };
}

/**
 * Distinct conflicts, in the order first seen. Three prior invoices repeating one
 * reference produce one conflict, not three — the ids are carried on the proposal's
 * `reason`, and a reviewer reading the same sentence three times learns nothing.
 */
export function distinctConflicts(conflicts: readonly Conflict[]): readonly Conflict[] {
  const seen = new Set<string>();
  const out: Conflict[] = [];
  for (const c of conflicts) {
    const key = `${c.code}|${String(c.field_path)}|${c.severity}|${c.clause}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
