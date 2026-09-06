// W05d — engine/holds/matching. Conflicts.
//
// A Conflict is the machine-readable reason a hold fired. The contract is explicit that
// `clause` is a SHORT FIXED PHRASE and not generated prose, so every phrase this family can
// emit is in the frozen table below and nothing interpolates into one. Payment ids, paise
// figures and composites are DATA and travel on the proposal's `reason`, where a reviewer
// reads them, not inside a sentence assembled at runtime.
//
// `applyAll()` throws on a proposal with an empty conflict array and it is right to. A held
// invoice with no stated reason is one a reviewer cannot act on — and, for a hold that
// releases itself, one nobody will ever look at. Every path below starts from a base
// conflict and adds to it, so the array is non-empty by construction rather than by
// inspection.

import type { Conflict, ConflictSeverity, FieldPath, MatchCandidate } from '@/lib/types';
import type { MatchingCause } from './assess';

const path = (p: string): FieldPath => p as FieldPath;

export const MATCHING_FIELD_PATHS = Object.freeze({
  invoice_reference: path('invoice.reference'),
  invoice_gross: path('invoice.gross_paise'),
  invoice_vendor: path('invoice.vendor_name_raw'),
  payment_narration: path('payment.narration_raw'),
  payment_value_date: path('payment.value_date'),
});

/** Exact phrases. Fixed, short, never assembled from parts. */
export const MATCHING_CLAUSES = Object.freeze({
  settling_line_carries_no_reference:
    'The bank line that reconciles this invoice carries no recoverable reference token.',
  settling_line_names_another_document:
    'The bank line that reconciles this invoice names another document.',
  nothing_reconciles_the_money: 'No candidate settles this invoice within the declared amount tolerance.',
  nothing_reached_the_bar: 'No candidate reached the acceptance bar; nothing settles this invoice.',
  no_candidate_retained: 'No payment scored above the retention floor for this invoice.',
  reference_mismatch: 'The reference on the payment side does not correspond to this invoice.',
  reference_absent: 'The best candidate line carries no recoverable reference token.',
  amount_over_tolerance: 'Settled amount differs from the invoice beyond the declared tolerance.',
  date_outside_window: 'The best candidate falls outside the settlement window.',
  vendor_below_similarity_floor: 'Vendor similarity on the best candidate is below the declared floor.',
  amount_over_cap: 'Invoice value is above the review cap; it sorts to the head of the queue.',
});

/**
 * The base conflict for `no_reference`.
 *
 * The finding is about the PAYMENT side, so both shapes point at `payment.narration_raw` —
 * the field the token was looked for in, and the field a reviewer has to go and read. The
 * two causes carry different CODES rather than one code with two clauses, because they are
 * different facts and they route to different fixes: nothing was written down, or something
 * was written down and it is not this invoice.
 */
export function noReferenceConflict(cause: MatchingCause): Conflict {
  if (cause === 'settling_line_names_another_document') {
    return {
      code: 'reference_mismatch',
      field_path: MATCHING_FIELD_PATHS.payment_narration,
      clause: MATCHING_CLAUSES.settling_line_names_another_document,
      severity: 'material',
    };
  }
  return {
    code: 'reference_absent',
    field_path: MATCHING_FIELD_PATHS.payment_narration,
    clause: MATCHING_CLAUSES.settling_line_carries_no_reference,
    severity: 'material',
  };
}

/**
 * The base conflict for `matching`, in its three shapes.
 *
 * `no_candidate_found` is the closest code the frozen `ConflictCode` union offers, and the
 * clauses keep the shapes distinguishable: nothing retained at all, nothing that reconciles
 * the money, or something that reconciles and names the document and still fell short. They
 * route differently — the first is a feed to go and look at, the last is a scorer result to
 * go and read — and collapsing them to one phrase would hide which of the three an invoice
 * is.
 */
export function matchingConflict(cause: MatchingCause): Conflict {
  const clause =
    cause === 'no_candidate_retained'
      ? MATCHING_CLAUSES.no_candidate_retained
      : cause === 'nothing_reconciles_the_money'
        ? MATCHING_CLAUSES.nothing_reconciles_the_money
        : MATCHING_CLAUSES.nothing_reached_the_bar;
  return {
    code: 'no_candidate_found',
    field_path: MATCHING_FIELD_PATHS.invoice_reference,
    clause,
    severity: 'material',
  };
}

/**
 * What the cited candidate actually failed on, read off its own `EvidenceSet`.
 *
 * Every one of these is the evidence row's own verdict — `within_tolerance` as the scorer
 * recorded it — rather than a second opinion formed here. A hold family that re-decided
 * whether a delta was inside tolerance could disagree with the score it is holding on, and
 * a reviewer shown two different answers to one question stops reading both.
 */
export function evidenceConflicts(
  candidate: MatchCandidate,
  referenceRecovered: boolean,
): readonly Conflict[] {
  const out: Conflict[] = [];
  const evidence = candidate.evidence;

  if (!evidence.amount.within_tolerance) {
    out.push({
      code: 'amount_over_tolerance',
      field_path: MATCHING_FIELD_PATHS.invoice_gross,
      clause: MATCHING_CLAUSES.amount_over_tolerance,
      severity: 'material',
    });
  }

  if (!referenceRecovered) {
    out.push({
      code: 'reference_absent',
      field_path: MATCHING_FIELD_PATHS.payment_narration,
      clause: MATCHING_CLAUSES.reference_absent,
      severity: 'material',
    });
  } else if (!evidence.reference.within_tolerance) {
    out.push({
      code: 'reference_mismatch',
      field_path: MATCHING_FIELD_PATHS.invoice_reference,
      clause: MATCHING_CLAUSES.reference_mismatch,
      severity: 'material',
    });
  }

  if (!evidence.date.within_tolerance) {
    out.push({
      code: 'date_outside_window',
      field_path: MATCHING_FIELD_PATHS.payment_value_date,
      clause: MATCHING_CLAUSES.date_outside_window,
      severity: 'advisory',
    });
  }

  if (!evidence.vendor.within_tolerance) {
    out.push({
      code: 'vendor_below_similarity_floor',
      field_path: MATCHING_FIELD_PATHS.invoice_vendor,
      clause: MATCHING_CLAUSES.vendor_below_similarity_floor,
      severity: 'advisory',
    });
  }

  return out;
}

/**
 * The frozen review cap, reported on a hold this family was raising anyway. It never
 * creates one on its own.
 *
 * SEVERITY IS NOT RELEASABILITY. `HOLD_POLICY` says both codes this family raises release
 * themselves when their condition resolves, and that is the registry's call rather than
 * this worker's — the whole reason the policy table lives there is that the family raising
 * a hold should not also decide who may lift it. What severity decides is the ORDER a human
 * works the queue in, and an invoice above the review cap with nothing settling it belongs
 * at the head of that queue whether or not anybody has to act on it today.
 */
export function capConflict(): Conflict {
  return {
    code: 'amount_over_cap',
    field_path: MATCHING_FIELD_PATHS.invoice_gross,
    clause: MATCHING_CLAUSES.amount_over_cap,
    severity: 'blocking',
  };
}

/** Distinct conflicts, in the order first seen. The same sentence twice teaches nothing. */
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

const SEVERITY_RANK: Readonly<Record<ConflictSeverity, number>> = Object.freeze({
  advisory: 0,
  material: 1,
  blocking: 2,
});

/** The worst severity present, never below the registry's declared default of `material`. */
export function severityOf(conflicts: readonly Conflict[]): ConflictSeverity {
  let worst: ConflictSeverity = 'material';
  for (const c of conflicts) {
    if (SEVERITY_RANK[c.severity] > SEVERITY_RANK[worst]) worst = c.severity;
  }
  return worst;
}
