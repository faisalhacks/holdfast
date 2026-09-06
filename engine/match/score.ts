// W04b — the composite.
//
// Four components, four declared weights, one number. `ScoreBreakdown` carries all of it:
// each component's own score, the weight applied to it, and the product, plus the weight
// table itself and the id of the spec that supplied it. A reviewer reconstructs the
// composite by adding four numbers off the screen, and if the addition does not come out
// they have found a bug rather than a judgement call.
//
// THE WEIGHTS TRAVEL WITH THE SCORE. Not in a config file the reader has to go and find, not
// in a release note — on the object. A ranked list whose weighting is somewhere else is a
// ranked list nobody can argue with.
//
// A SET OF PAYMENTS IS SCORED BY THE SAME CODE AS ONE. Amount sums; reference, vendor and
// date collapse by the rules in `SetAggregationSpec`. So when W05c searches subsets for a
// bulk settlement, every subset it tries comes back through this function and is judged the
// same way a one-to-one pairing is.

import type {
  AmountEvidence,
  CardinalityKind,
  DateEvidence,
  EvidenceSet,
  IsoDate,
  Paise,
  PaymentId,
  Ratio,
  ReferenceEvidence,
  ScoreBreakdown,
  ScoreComponent,
  ScoreWeights,
  VendorEvidence,
} from '@/lib/types';
import {
  amountComponent,
  dateAnchorOf,
  dateComponentFor,
  referenceComponentFor,
  vendorComponentFor,
  type AmountOutcome,
  type DateOutcome,
  type ReferenceOutcome,
  type VendorOutcome,
} from './components';
import { conflictsFor } from './conflicts';
import { asPaise, deltaPaise } from './money';
import { FIELD_PATHS } from './prepare';
import { clampRatio } from './similarity';
import type { MatchContext, PreparedInvoice, PreparedPayment, ScoredPairing } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation over a payment set
// ─────────────────────────────────────────────────────────────────────────────

function aggregateScore(values: readonly number[], how: 'max' | 'mean' | 'min'): Ratio {
  if (values.length === 0) return 0;
  if (how === 'mean') {
    let carried = 0;
    for (const v of values) carried += v;
    return clampRatio(carried / values.length);
  }
  let best = values[0] ?? 0;
  for (const v of values) {
    if (how === 'max' ? v > best : v < best) best = v;
  }
  return clampRatio(best);
}

/**
 * Which payment's row is cited in the evidence. `max` cites the strongest, `min` the weakest
 * — the one that made the aggregate what it is. `mean` has no single row behind it, so it
 * cites the strongest and the component score is the mean; that is the one place where the
 * cited similarity and the component score can differ, and it only arises for a sweep
 * variant that deliberately chose `mean`.
 */
function citedIndex(values: readonly number[], how: 'max' | 'mean' | 'min'): number {
  if (values.length === 0) return 0;
  let at = 0;
  let best = values[0] ?? 0;
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i] ?? 0;
    if (how === 'min' ? v < best : v > best) {
      best = v;
      at = i;
    }
  }
  return at;
}

/** The payment whose date represents the settlement. A settlement completes on its last. */
function representativeDateIndex(
  invoice: PreparedInvoice,
  payments: readonly PreparedPayment[],
  how: 'latest' | 'earliest' | 'nearest',
): number {
  if (payments.length <= 1) return 0;
  let at = 0;
  let best: number | null = null;
  for (let i = 0; i < payments.length; i += 1) {
    const p = payments[i];
    if (p === undefined) continue;
    const key =
      how === 'nearest'
        ? p.day_index === null || invoice.day_index === null
          ? Number.POSITIVE_INFINITY
          : Math.abs(p.day_index - invoice.day_index)
        : (p.day_index ?? (how === 'latest' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY));
    if (best === null) {
      best = key;
      at = i;
      continue;
    }
    const better = how === 'latest' ? key > best : key < best;
    if (better) {
      best = key;
      at = i;
    }
  }
  return at;
}

// ─────────────────────────────────────────────────────────────────────────────
// The breakdown
// ─────────────────────────────────────────────────────────────────────────────

function component(score: Ratio, weight: Ratio): ScoreComponent {
  const s = clampRatio(score);
  return { score: s, weight, contribution: s * weight };
}

export function buildBreakdown(
  scores: { amount: Ratio; reference: Ratio; date: Ratio; vendor: Ratio },
  weights: ScoreWeights,
  scorerVersion: string,
): ScoreBreakdown {
  const amount = component(scores.amount, weights.amount);
  const reference = component(scores.reference, weights.reference);
  const date = component(scores.date, weights.date);
  const vendor = component(scores.vendor, weights.vendor);
  return {
    amount,
    reference,
    date,
    vendor,
    weights,
    composite: clampRatio(
      amount.contribution + reference.contribution + date.contribution + vendor.contribution,
    ),
    scorer_version: scorerVersion,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The evidence
// ─────────────────────────────────────────────────────────────────────────────

function buildEvidence(
  invoice: PreparedInvoice,
  citedPayment: PreparedPayment | undefined,
  amount: AmountOutcome,
  reference: ReferenceOutcome,
  vendor: VendorOutcome,
  date: DateOutcome,
): EvidenceSet {
  const vendorEvidence: VendorEvidence = {
    field: 'vendor',
    path: FIELD_PATHS.invoice_vendor,
    invoice_value: vendor.invoice_value,
    payment_value: vendor.payment_value,
    tolerance: vendor.tolerance,
    within_tolerance: vendor.within_tolerance,
    normalisation: vendor.note,
    delta: vendor.observed,
    invoice_vendor_id: invoice.vendor.vendor_id,
    payment_vendor_id: citedPayment === undefined ? null : citedPayment.vendor.vendor_id,
  };

  const amountEvidence: AmountEvidence = {
    field: 'amount',
    path: FIELD_PATHS.invoice_gross,
    invoice_value: invoice.gross_paise,
    payment_value: amount.settled,
    tolerance: amount.tolerance,
    within_tolerance: amount.within_tolerance,
    normalisation: null,
    delta: amount.delta,
    cause: amount.cause,
  };

  const dateEvidence: DateEvidence = {
    field: 'date',
    // The path names the date the delta was actually measured from, so a reviewer is never
    // shown a gap computed against a date that is not on the row.
    path: date.anchor_path,
    invoice_value: date.anchor_date === null ? null : (date.anchor_date as IsoDate),
    payment_value: date.payment_date === null ? null : (date.payment_date as IsoDate),
    tolerance: date.tolerance,
    within_tolerance: date.within_tolerance,
    normalisation: null,
    delta: date.delta,
  };

  const referenceEvidence: ReferenceEvidence = {
    field: 'reference',
    path: FIELD_PATHS.invoice_reference,
    invoice_value: reference.invoice_value,
    payment_value: reference.payment_value,
    tolerance: reference.tolerance,
    within_tolerance: reference.within_tolerance,
    normalisation: reference.note,
    delta: reference.observed,
    displaced: reference.displaced,
    displaced_from: reference.displaced_from,
  };

  return {
    vendor: vendorEvidence,
    amount: amountEvidence,
    date: dateEvidence,
    reference: referenceEvidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cardinality
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this scorer can honestly say about the shape of a pairing from the pairing alone.
 *
 * One payment is `one_to_one`; several are `one_to_many`. `many_to_one` and `partial`
 * require knowing that a payment is shared with ANOTHER invoice, or that a residual is
 * deliberate — cross-invoice facts this function does not have and will not guess. W05c has
 * them, and passes its own value through `CandidateProposal.cardinality`.
 */
export function cardinalityOf(paymentCount: number): CardinalityKind {
  return paymentCount > 1 ? 'one_to_many' : 'one_to_one';
}

// ─────────────────────────────────────────────────────────────────────────────
// The scorer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores one invoice against one set of payments. This is the ONLY place a composite is
 * produced, which is what makes "every candidate re-enters the same deterministic scorer"
 * a structural fact rather than a promise: a generated proposal, a feedback rule's pairing
 * and a cross-product pair all arrive here and leave with the same four components.
 */
export function scorePairing(
  invoice: PreparedInvoice,
  payments: readonly PreparedPayment[],
  ctx: MatchContext,
  cardinality?: CardinalityKind,
): ScoredPairing {
  const { spec, policy } = ctx;

  const amount = amountComponent(invoice.gross_paise, payments, spec);

  const referenceOutcomes = payments.map((p) => referenceComponentFor(invoice, p, spec));
  const vendorOutcomes = payments.map((p) => vendorComponentFor(invoice, p, spec));

  const referenceScore = aggregateScore(
    referenceOutcomes.map((o) => o.score),
    spec.aggregation.reference,
  );
  const vendorScore = aggregateScore(
    vendorOutcomes.map((o) => o.score),
    spec.aggregation.vendor,
  );

  const referenceCited =
    referenceOutcomes[
      citedIndex(referenceOutcomes.map((o) => o.score), spec.aggregation.reference)
    ];
  const vendorCited =
    vendorOutcomes[citedIndex(vendorOutcomes.map((o) => o.score), spec.aggregation.vendor)];

  const dateAt = representativeDateIndex(invoice, payments, spec.aggregation.date);
  const datePayment = payments[dateAt];
  const dateAnchor = dateAnchorOf(invoice, spec);
  const date: DateOutcome =
    datePayment === undefined
      ? {
          score: clampRatio(spec.date.absent_score),
          delta: 0,
          payment_date: null,
          anchor_date: dateAnchor.value,
          anchor_path: dateAnchor.path,
          absent: true,
          tolerance: { kind: 'days', value: policy.date_window_days },
          within_tolerance: false,
        }
      : dateComponentFor(invoice, datePayment, spec, policy);

  const reference: ReferenceOutcome =
    referenceCited ??
    ({
      score: clampRatio(spec.reference.absent_score),
      observed: 0,
      exact: false,
      carried: false,
      invoice_value: null,
      payment_value: null,
      displaced: false,
      displaced_from: null,
      note: null,
      absent: true,
      tolerance: { kind: 'similarity', value: spec.reference.floor },
      within_tolerance: false,
    } satisfies ReferenceOutcome);

  const vendor: VendorOutcome =
    vendorCited ??
    ({
      score: clampRatio(spec.vendor.absent_score),
      observed: 0,
      invoice_value: null,
      payment_value: null,
      note: null,
      absent: true,
      tolerance: { kind: 'similarity', value: spec.vendor.floor },
      within_tolerance: false,
    } satisfies VendorOutcome);

  const score = buildBreakdown(
    {
      amount: amount.score,
      reference: referenceScore,
      date: date.score,
      vendor: vendorScore,
    },
    spec.weights,
    spec.id,
  );

  const evidence = buildEvidence(invoice, payments[dateAt], amount, reference, vendor, date);
  const residual = deltaPaise(amount.settled, invoice.gross_paise);

  return {
    invoice_id: invoice.invoice_id,
    payment_ids: payments.map((p) => p.payment_id) as readonly PaymentId[],
    score,
    evidence,
    conflicts: conflictsFor({ invoice, evidence, reference, vendor, residual, ctx }),
    residual_paise: residual,
    settled_paise: amount.settled,
    cardinality: cardinality ?? cardinalityOf(payments.length),
    exact: isExactPairing(amount, reference),
  };
}

/**
 * EXACT MATCH ON (REFERENCE, AMOUNT). Canonicalised references equal on both sides, and the
 * settled sum equal to the invoice gross to the paise. Nothing fuzzy, no band, no window.
 * It is a separate predicate from the score because it is the one claim a reviewer never has
 * to take on trust.
 */
export function isExactPairing(amount: AmountOutcome, reference: ReferenceOutcome): boolean {
  return reference.exact && !reference.absent && amount.delta === (0 as Paise);
}

/** The stable id of a pairing. Deterministic: same run, same ids, same string, forever. */
export function pairingKey(invoiceId: string, paymentIds: readonly string[]): string {
  return `${invoiceId}|${[...paymentIds].sort().join('+')}`;
}

/** Invoice gross minus what the pairing settles. Zero on a full settlement. */
export function residualOf(gross: Paise, settled: Paise): Paise {
  return asPaise(gross - settled);
}
