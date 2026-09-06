/**
 * W05b — the variance checks themselves.
 *
 * Each check is a pure function from the case under examination to zero or more typed
 * holds. Nothing here releases anything, nothing here decides a case, and nothing here
 * reads a model's output.
 *
 * The severity and the policy of every hold come from `HOLD_POLICY` in the registry. This
 * file does not restate whether a hold auto-releases or blocks accounting, because a
 * hold's policy is a DOMAIN fact owned in one place, and the worker that raises a hold
 * should not also be the one deciding it can be cleared without a human.
 */

import type {
  Conflict,
  ConflictCode,
  FieldPath,
  Invoice,
  IsoDate,
  MatchCandidate,
  Paise,
  Payment,
  TaxBreakdown,
} from '@/lib/types';
import type { HoldContext, HoldProposal } from '@/engine/holds/registry';
import { HOLD_POLICY } from '@/engine/holds/registry';
import { CAUSE_CLAUSES, CAUSE_REASONS, classifyDelta } from './cause';
import {
  GST_RATE_PERCENTS,
  HALF_SPLIT_ROUNDING_PAISE,
  SETTLEMENT_ATTRIBUTION_CEILING_BASIS_POINTS,
  TAX_AMOUNT_RANGE_PAISE,
  TAX_RATE_TOLERANCE_BASIS_POINTS,
} from './tolerances';

// ─────────────────────────────────────────────────────────────────────────────
// Small constructors
// ─────────────────────────────────────────────────────────────────────────────

function conflictOn(
  type: HoldProposal['type'],
  code: ConflictCode,
  path: string,
  clause: string
): Conflict {
  return {
    code,
    field_path: path as FieldPath,
    clause,
    severity: HOLD_POLICY[type].default_severity,
  };
}

function proposal(
  invoice: Invoice,
  type: HoldProposal['type'],
  reason: string,
  conflicts: readonly Conflict[]
): HoldProposal {
  return {
    invoice_id: invoice.id,
    type,
    reason,
    severity: HOLD_POLICY[type].default_severity,
    conflicts,
  };
}

/**
 * Rs 5,00,000 and above, a human reviews regardless of score. The cap is frozen in
 * `eval/thresholds.json` and arrives on the context; it is never restated here, because the
 * worker enforcing a limit must not be the one able to tune it.
 */
function capConflict(invoice: Invoice, ctx: HoldContext, type: HoldProposal['type']): Conflict | null {
  if (Math.abs(invoice.gross_paise) < ctx.policy.amount_cap_paise) return null;
  return conflictOn(
    type,
    'amount_over_cap',
    'invoice.gross_paise',
    'Invoice value is at or above the review cap.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tax — place of supply, statutory rate, and the two tolerance types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A supply is intra-state (CGST + SGST, one half to each government) or inter-state (IGST,
 * one head). Both at once is never right, and neither is a supply booked against the head
 * the vendor's other supplies do not use.
 */
export type SupplyScheme = 'intra_state' | 'inter_state' | 'mixed' | 'exempt';

export function schemeOf(tax: TaxBreakdown): SupplyScheme {
  const hasIntegrated = tax.igst_paise !== 0;
  const hasSplit = tax.cgst_paise !== 0 || tax.sgst_paise !== 0;
  if (hasIntegrated && hasSplit) return 'mixed';
  if (hasIntegrated) return 'inter_state';
  if (hasSplit) return 'intra_state';
  return 'exempt';
}

/**
 * The scheme this vendor's OTHER documents in the run are booked under.
 *
 * Place of supply is a property of the pair (vendor, buyer), not of the individual
 * document: a vendor registered in our own state cannot be intra-state on one invoice and
 * inter-state on the next. So the vendor's own history is the evidence, and it is evidence
 * this family can actually see — `HoldContext` carries the ledger but not the vendor
 * master, so the registration number is not available to us and we do not pretend it is.
 *
 * Returns null when the vendor has no other documents, or when they disagree among
 * themselves. No evidence is not the same as evidence of an error, and we raise nothing.
 * A vendor billing us for the first time therefore gets no split hold at all, which is the
 * correct answer: we have nothing to compare against and will not invent something.
 */
export function establishedScheme(invoice: Invoice, ledger: readonly Invoice[]): SupplyScheme | null {
  let established: SupplyScheme | null = null;
  for (const other of ledger) {
    if (other.id === invoice.id) continue;
    if (other.vendor_id !== invoice.vendor_id) continue;
    const scheme = schemeOf(other.tax);
    if (scheme !== 'intra_state' && scheme !== 'inter_state') continue;
    if (established === null) established = scheme;
    else if (established !== scheme) return null;
  }
  return established;
}

/** The statutory rate the tax amount is closest to, and the tax that rate implies. */
function impliedByStatutoryRate(netMagnitude: number, taxExCess: number): number {
  let expected = 0;
  let closest = Number.POSITIVE_INFINITY;
  for (const percent of GST_RATE_PERCENTS) {
    const candidate = Math.round((netMagnitude * percent) / 100);
    const distance = Math.abs(taxExCess - candidate);
    if (distance < closest) {
      closest = distance;
      expected = candidate;
    }
  }
  return expected;
}

interface TaxDelta {
  readonly delta: number;
  readonly expected: number;
  readonly code: ConflictCode;
  readonly path: string;
  readonly clause: string;
}

/**
 * Tax holds.
 *
 * The split is by TOLERANCE TYPE, and it is the whole point of carrying two codes:
 *
 *   - a breach of the PERCENTAGE tolerance is `tax_variance`
 *   - a breach of the ABSOLUTE tolerance is `tax_amount_range`
 *
 * They are tested independently and either, both or neither may fire. A six-hundred-rupee
 * error on a two-crore invoice breaches the absolute tolerance and not the percentage one,
 * and collapsing the two would report it as the wrong kind of problem to the wrong team.
 * This is Oracle's distinction and we keep it.
 *
 * A misallocated split — the heads sum to the right total but sit on the wrong head — is
 * `tax_variance`. No monetary amount is out of range; the component that should be zero is
 * the entire tax, which is a proportional error and not an absolute one.
 */
export function taxChecks(ctx: HoldContext): readonly HoldProposal[] {
  const invoice = ctx.invoice;
  const tax = invoice.tax;

  const netMagnitude = Math.abs(invoice.net_paise);
  const totalMagnitude = Math.abs(tax.total_paise);
  const cessMagnitude = Math.abs(tax.cess_paise);
  const taxExCess = totalMagnitude - cessMagnitude;

  const percentageConflicts: Conflict[] = [];
  const absoluteConflicts: Conflict[] = [];

  // ── allocation: always a percentage-type finding ────────────────────────────
  const scheme = schemeOf(tax);
  const partsSum = tax.igst_paise + tax.cgst_paise + tax.sgst_paise + tax.cess_paise;
  const partsResidual = partsSum - tax.total_paise;

  if (scheme === 'mixed') {
    percentageConflicts.push(
      conflictOn(
        'tax_variance',
        'tax_split_mismatch',
        'invoice.tax',
        'Integrated and split tax heads are both used on one supply.'
      )
    );
  }

  if (scheme === 'intra_state' && Math.abs(tax.cgst_paise - tax.sgst_paise) > HALF_SPLIT_ROUNDING_PAISE) {
    percentageConflicts.push(
      conflictOn(
        'tax_variance',
        'tax_split_mismatch',
        'invoice.tax.cgst_paise',
        'Central and state halves of the split are not equal.'
      )
    );
  }

  // Deliberately ONE-DIRECTIONAL, and the asymmetry is the point.
  //
  // Booking CGST + SGST is a positive assertion that the place of supply is our own state:
  // two state-specific heads that are filed in that state's return and claimable nowhere
  // else. Booking IGST asserts nothing of the kind — it is the head a vendor master falls
  // back to when nobody set the place of supply, which is exactly how this error is made.
  //
  // So an intra-state sibling contradicts an integrated booking, and an integrated sibling
  // does not contradict a split one. Running the rule both ways would flag the correct
  // document alongside the wrong one every time a vendor had exactly one of each, and a
  // hold on the correct row costs a reviewer the same time as a hold on the wrong one.
  if (scheme === 'inter_state' && partsResidual === 0) {
    if (establishedScheme(invoice, ctx.ledger) === 'intra_state') {
      percentageConflicts.push(
        conflictOn(
          'tax_variance',
          'tax_split_mismatch',
          'invoice.tax.igst_paise',
          'Integrated tax on a supply this vendor bills as intra-state.'
        )
      );
    }
  }

  // ── amounts: each delta meets BOTH tolerance types ──────────────────────────
  const deltas: TaxDelta[] = [];

  if (partsResidual !== 0) {
    deltas.push({
      delta: partsResidual,
      expected: totalMagnitude,
      code: 'tax_total_mismatch',
      path: 'invoice.tax.total_paise',
      clause: 'Tax heads do not sum to the tax total.',
    });
  }

  if (netMagnitude > 0) {
    const expected = impliedByStatutoryRate(netMagnitude, taxExCess);
    const rateDelta = taxExCess - expected;
    if (rateDelta !== 0) {
      deltas.push({
        delta: rateDelta,
        expected,
        code: 'tax_total_mismatch',
        path: 'invoice.tax.total_paise',
        clause: 'Tax amount differs from the amount implied by the statutory rate.',
      });
    }
  }

  for (const entry of deltas) {
    const magnitude = Math.abs(entry.delta);
    if (magnitude * 10000 > entry.expected * TAX_RATE_TOLERANCE_BASIS_POINTS) {
      percentageConflicts.push(conflictOn('tax_variance', entry.code, entry.path, entry.clause));
    }
    if (magnitude > TAX_AMOUNT_RANGE_PAISE) {
      absoluteConflicts.push(conflictOn('tax_amount_range', entry.code, entry.path, entry.clause));
    }
  }

  const out: HoldProposal[] = [];

  if (percentageConflicts.length > 0) {
    const cap = capConflict(invoice, ctx, 'tax_variance');
    if (cap !== null) percentageConflicts.push(cap);
    out.push(
      proposal(invoice, 'tax_variance', 'Tax differs beyond the percentage tolerance.', percentageConflicts)
    );
  }

  if (absoluteConflicts.length > 0) {
    const cap = capConflict(invoice, ctx, 'tax_amount_range');
    if (cap !== null) absoluteConflicts.push(cap);
    out.push(
      proposal(
        invoice,
        'tax_amount_range',
        'Tax amount falls outside the permitted absolute range.',
        absoluteConflicts
      )
    );
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Distribution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gross = net + tax is an accounting identity, not a target. When it does not hold, the
 * distribution lines cannot foot to the invoice header and no accounting entry should be
 * created — which is exactly what `dist_variance` declares in the policy table.
 */
export function distributionCheck(ctx: HoldContext): readonly HoldProposal[] {
  const invoice = ctx.invoice;
  const residual = invoice.gross_paise - (invoice.net_paise + invoice.tax.total_paise);
  if (residual === 0) return [];

  const conflicts: Conflict[] = [
    conflictOn(
      'dist_variance',
      'tax_total_mismatch',
      'invoice.gross_paise',
      'Invoice total does not equal net plus tax.'
    ),
  ];
  const cap = capConflict(invoice, ctx, 'dist_variance');
  if (cap !== null) conflicts.push(cap);

  return [
    proposal(invoice, 'dist_variance', 'Distribution total does not equal the invoice total.', conflicts),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Period
// ─────────────────────────────────────────────────────────────────────────────

function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

/**
 * The booked period must be the period the document itself belongs to.
 *
 * Deliberately keyed on the INVOICE DATE and not on the receipt date. Late receipt is
 * ordinary — a third of any AP ledger arrives in the month after it was raised, and holding
 * all of it would bury the queue in noise the moment the gate turned on. What is not
 * ordinary is a document booked into a period that is neither the one it was raised in nor
 * a deliberate accrual anyone recorded, and that is a cut-off exposure the controller has to
 * see before the ledger closes. The receipt date rides along on the conflict so the reviewer
 * can tell a late arrival from a back-dated booking at a glance.
 */
export function periodChecks(ctx: HoldContext): readonly HoldProposal[] {
  const invoice = ctx.invoice;
  const out: HoldProposal[] = [];

  if (invoice.period !== monthOf(invoice.invoice_date)) {
    const conflicts: Conflict[] = [
      conflictOn(
        'period_deferral',
        'period_mismatch',
        'invoice.period',
        'Booked period is not the period of the invoice date.'
      ),
    ];
    if (monthOf(invoice.received_date) !== monthOf(invoice.invoice_date)) {
      conflicts.push(
        conflictOn(
          'period_deferral',
          'period_mismatch',
          'invoice.received_date',
          'Invoice date and receipt date fall in different periods.'
        )
      );
    }
    out.push(
      proposal(invoice, 'period_deferral', 'Booked period does not match the invoice date.', conflicts)
    );
  }

  // A credit note raised in one period and received in the next lands on the wrong side of
  // a close: the debit it offsets is already booked, and applying the note where it arrived
  // rather than where it belongs overstates one period and understates the other. Never
  // auto-releasable, because deciding which period wears it is a judgement.
  if (invoice.is_credit_note && monthOf(invoice.received_date) !== monthOf(invoice.invoice_date)) {
    const conflicts: Conflict[] = [
      conflictOn(
        'credit_note_crossing',
        'credit_note_crosses_period',
        'invoice.received_date',
        'Credit note was raised in one period and received in the next.'
      ),
    ];
    const cap = capConflict(invoice, ctx, 'credit_note_crossing');
    if (cap !== null) conflicts.push(cap);
    out.push(
      proposal(invoice, 'credit_note_crossing', 'Credit note crosses a period boundary.', conflicts)
    );
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settled amount
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The best one-to-one candidate.
 *
 * Restricted to a single payment settling a single invoice on purpose. A residual left over
 * a bulk or part settlement is `cardinality_residual` and belongs to W05c; reporting it here
 * as a variance would double-hold the same rupees under two codes and make the per-hold-type
 * numbers meaningless.
 *
 * A `model_proposal` that has not been re-scored by the deterministic scorer is skipped.
 * The LLM proposes and deterministic code verifies; a nomination that has not re-entered the
 * scorer does not get to put a hold on an invoice any more than it gets to take one off.
 */
function bestSettlement(candidates: readonly MatchCandidate[]): MatchCandidate | null {
  let best: MatchCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.proposed_by === 'model_proposal' && !candidate.reverified) continue;
    if (candidate.cardinality !== 'one_to_one') continue;
    if (candidate.payment_ids.length !== 1) continue;
    if (best === null || candidate.rank < best.rank) best = candidate;
  }
  return best;
}

interface Settlement {
  readonly delta: Paise;
  readonly settled_on: IsoDate | null;
}

/**
 * The delta is recomputed from the raw payment wherever the payment is in the window,
 * rather than trusted from the candidate. The matcher's own evidence is the fallback, not
 * the source: a hold that fires off a number another component derived is a hold that
 * inherits that component's bugs.
 */
function settlementOf(
  invoice: Invoice,
  candidate: MatchCandidate,
  payments: readonly Payment[]
): Settlement | null {
  const paymentId = candidate.payment_ids[0];
  if (paymentId === undefined) return null;
  for (const payment of payments) {
    if (payment.id !== paymentId) continue;
    return {
      delta: (payment.amount_paise - invoice.gross_paise) as Paise,
      settled_on: payment.value_date,
    };
  }
  return {
    delta: candidate.evidence.amount.delta,
    settled_on: candidate.evidence.date.payment_value,
  };
}

/**
 * A settled amount that does not equal the invoice, with the CAUSE named where the
 * arithmetic supports one.
 *
 * There is no auto-write-off band. A sub-rupee delta still raises a hold; it raises one
 * whose conflict says `rounding`, which a reviewer clears in a second and an auditor can
 * see was cleared. Absorbing it silently is the behaviour we are here to replace.
 */
export function settlementCheck(ctx: HoldContext): readonly HoldProposal[] {
  const invoice = ctx.invoice;
  const candidate = bestSettlement(ctx.candidates);
  if (candidate === null) return [];

  const settlement = settlementOf(invoice, candidate, ctx.payments);
  if (settlement === null) return [];

  const delta: number = settlement.delta;
  if (delta === 0) return [];

  const grossMagnitude = Math.abs(invoice.gross_paise);
  if (
    grossMagnitude > 0 &&
    Math.abs(delta) * 10000 > grossMagnitude * SETTLEMENT_ATTRIBUTION_CEILING_BASIS_POINTS
  ) {
    // Not a variance on a settlement — a settlement that did not happen. `matching` is the
    // honest hold and this family does not own it.
    return [];
  }

  const attribution = classifyDelta(invoice, settlement.delta, settlement.settled_on);

  const conflicts: Conflict[] = [
    conflictOn(
      'price_variance',
      'amount_over_tolerance',
      'invoice.gross_paise',
      CAUSE_CLAUSES[attribution.cause]
    ),
  ];
  const cap = capConflict(invoice, ctx, 'price_variance');
  if (cap !== null) conflicts.push(cap);

  return [proposal(invoice, 'price_variance', CAUSE_REASONS[attribution.cause], conflicts)];
}
