// W04b — conflicts.
//
// A conflict is the MACHINE-READABLE reason a pairing is not clean. It is not prose, it is
// not a narrative, and it is not generated: a code from the frozen `ConflictCode` union, the
// dotted path of the field it is about, a short fixed clause declared in `MatchSpec`, and a
// severity declared in the same place.
//
// This module RAISES NO HOLDS. Holds are typed, they stop an invoice being paid, and they
// belong to engine/holds — W05a, W05b and W05c own that and the registry is frozen so none
// of them can quietly claim another's slot. What a conflict does is give those families, and
// the reviewer, a structured statement of what did not line up. Every held invoice must
// carry at least one, and `conflicts_per_held_invoice` is a floor in eval/thresholds.json
// precisely so that an empty array fails loudly instead of reading as "nothing wrong".
//
// `amount_over_cap` is the one conflict that fires on the INVOICE ALONE, regardless of how
// well the pairing scores. eval/thresholds.json derives `rupees_at_risk_max_paise` from the
// cap on the stated ground that a false clear above the cap is impossible by construction,
// because the cap forces human review whatever the score says. That derivation is only sound
// if this fires every time, so it does.

import type { Conflict, ConflictCode, EvidenceSet, Paise } from '@/lib/types';
import type { ReferenceOutcome, VendorOutcome } from './components';
import { exceedsAmountCap } from './policy';
import { FIELD_PATHS } from './prepare';
import { clauseOf, severityOf } from './spec';
import type { MatchContext, PreparedInvoice } from './types';

export interface ConflictInput {
  readonly invoice: PreparedInvoice;
  readonly evidence: EvidenceSet;
  readonly reference: ReferenceOutcome;
  readonly vendor: VendorOutcome;
  readonly residual: Paise;
  readonly ctx: MatchContext;
}

function conflict(
  ctx: MatchContext,
  code: ConflictCode,
  path: Conflict['field_path'],
): Conflict {
  return {
    code,
    field_path: path,
    clause: clauseOf(ctx.spec, code),
    severity: severityOf(ctx.spec, code),
  };
}

/**
 * Every reason this pairing is not clean, in a fixed order.
 *
 * The order is by field, not by severity, so two candidates for the same invoice produce
 * comparable lists. Sorting by severity would reorder the array whenever a spec changed a
 * severity, and a diff between two runs would light up on rows that did not move.
 */
export function conflictsFor(input: ConflictInput): readonly Conflict[] {
  const { invoice, evidence, reference, vendor, residual, ctx } = input;
  const out: Conflict[] = [];

  // ── reference ──────────────────────────────────────────────────────────────
  if (reference.absent) {
    out.push(conflict(ctx, 'reference_absent', FIELD_PATHS.invoice_reference));
  } else if (!evidence.reference.within_tolerance && !reference.carried) {
    // `within_tolerance` on the evidence row is about the TOKEN similarity, because that is
    // what the contract defines `ReferenceEvidence.delta` to be. The conflict is about the
    // PAIRING: when the digit sequences carried the component — one document written under
    // two conventions — the references do correspond, and saying otherwise would put a
    // material conflict on a row that is right.
    out.push(conflict(ctx, 'reference_mismatch', FIELD_PATHS.invoice_reference));
  }
  if (reference.displaced) {
    out.push(
      conflict(
        ctx,
        'reference_displaced',
        reference.displaced_from ?? FIELD_PATHS.invoice_reference,
      ),
    );
  }

  // ── amount ─────────────────────────────────────────────────────────────────
  if (exceedsAmountCap(invoice.gross_paise, ctx.policy)) {
    out.push(conflict(ctx, 'amount_over_cap', FIELD_PATHS.invoice_gross));
  }
  if (!evidence.amount.within_tolerance) {
    out.push(conflict(ctx, 'amount_over_tolerance', FIELD_PATHS.invoice_gross));
  }
  if (residual !== 0) {
    out.push(conflict(ctx, 'residual_unsettled', FIELD_PATHS.invoice_gross));
  }

  // ── date ───────────────────────────────────────────────────────────────────
  if (!evidence.date.within_tolerance) {
    // The path follows the anchor the score was measured from, so the conflict points at the
    // date on the row rather than at one the reviewer would have to go and look up.
    out.push(conflict(ctx, 'date_outside_window', evidence.date.path));
  }

  // ── vendor ─────────────────────────────────────────────────────────────────
  const invoiceVendorId = evidence.vendor.invoice_vendor_id;
  const paymentVendorId = evidence.vendor.payment_vendor_id;
  if (invoiceVendorId !== null && paymentVendorId !== null && invoiceVendorId !== paymentVendorId) {
    // Two pinned identities that disagree. Stronger evidence than any string similarity,
    // and in the opposite direction.
    out.push(conflict(ctx, 'vendor_mismatch', FIELD_PATHS.invoice_vendor));
  } else if (!vendor.absent && !vendor.within_tolerance) {
    out.push(conflict(ctx, 'vendor_below_similarity_floor', FIELD_PATHS.invoice_vendor));
  }

  return out;
}

/** No payment scored above the retention floor for this invoice. */
export function noCandidateConflict(ctx: MatchContext): Conflict {
  return conflict(ctx, 'no_candidate_found', FIELD_PATHS.invoice_reference);
}

/**
 * Two or more candidates within the declared tie window.
 *
 * This is the SAP F.13 case: gross agreeing to the paise, references agreeing, and only the
 * date window separating the rows. Reporting the tie is the whole point — resolving it
 * silently by array order would make the answer depend on the order the ledger happened to
 * be read in, which is exactly the kind of unrecorded reason a sweep cannot recover from.
 */
export function tiedCandidatesConflict(ctx: MatchContext): Conflict {
  return conflict(ctx, 'multiple_candidates_tied', FIELD_PATHS.invoice_gross);
}
