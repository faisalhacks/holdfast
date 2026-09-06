// W04b — THE DECLARED SPEC.
//
// Everything the scorer decides with is data in this file. Not a literal buried in a
// comparison, not a constant closed over by a helper, not an environment variable. Twenty
// agents are about to sweep normalisation strategies against this scorer, and a sweep whose
// knobs live inside the logic is a sweep that cannot report what it changed.
//
// Three properties, structural rather than conventional:
//
//   1. ONE OBJECT. A `MatchSpec` is the complete configuration of the scorer. Two runs with
//      the same spec and the same input agree, on any machine, forever. There is no module
//      state, no memoisation and no clock anywhere under engine/match.
//   2. THE ID MOVES WITH THE DATA. `withWeights` and `withSpec` REQUIRE a new `id`, exactly
//      as `withOrder` does in engine/normalise/profiles.ts. `ScoreBreakdown.scorer_version`
//      carries that id onto every score, so a number in a report names the spec that
//      produced it. Two strategies that report the same version are indistinguishable
//      afterwards, and that is a worse outcome than a failed run.
//   3. POLICY IS NOT HERE. The amount cap, the date window and the subset bound are frozen
//      in eval/thresholds.json and arrive through `MatchPolicy`. The worker enforcing a
//      limit does not get to tune it — see policy.ts.
//
// HOW A SEARCH AGENT SWAPS A STRATEGY
//
//   const spec = withWeights(MATCH_SPEC_V1, 'match.v1+ref-heavy',
//     { amount: 0.30, reference: 0.50, date: 0.05, vendor: 0.15 });
//
//   const spec = withSpec(MATCH_SPEC_V1, 'match.v1+partial-vendor', {
//     vendor: { ...MATCH_SPEC_V1.vendor, comparator: 'partial_token_set_ratio' },
//   });
//
// and nothing in this module is edited to do it. `validateSpec` rejects a malformed variant
// before it runs, so a mistyped sweep entry fails loudly instead of quietly testing the
// default.

import type {
  ConflictCode,
  ConflictSeverity,
  DeltaCause,
  Days,
  Paise,
  Ratio,
  ScoreWeights,
} from '@/lib/types';
import type { ComparatorId, DigitContainment } from './similarity';

// ─────────────────────────────────────────────────────────────────────────────
// Component specs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a monetary delta becomes a score in [0, 1]. Piecewise linear and monotone in the
 * absolute delta, so a bigger gap never scores higher — a property a reviewer can check by
 * reading two rows, without reading this file.
 *
 * The band is declared BOTH as an absolute paise figure and as a proportion of the invoice,
 * and the wider of the two applies. A flat Rs 50 bank charge is invisible on a Rs 5,00,000
 * invoice and fatal on a Rs 500 one; a single form of the bound gets one of those wrong.
 */
export interface AmountScoreSpec {
  /** Absolute delta at or below this scores 1. Paise-level rounding drift. */
  readonly exact_paise: Paise;
  /** Lower bound of the "near" band, in paise. */
  readonly near_paise: Paise;
  /** Lower bound of the "near" band, as a proportion of the invoice gross. */
  readonly near_ratio: Ratio;
  /** The score awarded at the far edge of the near band. */
  readonly near_score: Ratio;
  /**
   * Delta beyond this proportion of the invoice gross scores 0. Proportional only: an
   * absolute zero-bound would let a large delta on a small invoice keep a positive score,
   * which is the wrong direction for the one figure we publish as an absolute count.
   */
  readonly zero_ratio: Ratio;
  /**
   * Multiplier when the payment side is LARGER than the invoice. An overpayment is not the
   * same evidence as a short payment: net-of-charges settlement explains a shortfall, and
   * nothing routine explains an excess.
   */
  readonly over_multiplier: Ratio;
}

/**
 * The reference is the strongest single piece of evidence when it is present, and this
 * spec is where "present" is defined.
 *
 * Two views are combined. The TOKEN view is `fuzzball`'s token-set ratio over the
 * canonicalised reference. The DIGIT view compares `NormalisationResult.digits` — every
 * digit of the raw value, separators discarded — which is the only bridge across
 * convention drift: `INV/2024/0042` and `INV20240042` agree on digits and cannot agree on
 * tokens, because no token rule can recover a boundary nobody wrote down.
 */
export interface ReferenceScoreSpec {
  readonly comparator: ComparatorId;
  /** Weight of the token-set view within the reference component. */
  readonly token_weight: Ratio;
  /** Weight of the digit-sequence view within the reference component. */
  readonly digit_weight: Ratio;
  /** Token-set ratio below this contributes nothing. A weak fuzzy reference is noise. */
  readonly floor: Ratio;
  /** Rescale [floor, 1] onto [0, 1] once the floor is cleared. */
  readonly rescale_above_floor: boolean;
  /** Score when either side offers no reference at all. */
  readonly absent_score: Ratio;
  /**
   * Multiplier when the winning reference token was recovered from the wrong field.
   * DECLARED AT 1.0 ON PURPOSE. A reference found in the vendor field is a RECOVERY, not a
   * defect, and quietly discounting it would hide the field-displacement case rather than
   * report it. The fact is carried instead as `ReferenceEvidence.displaced` and as an
   * advisory `reference_displaced` conflict, where a reviewer sees it.
   */
  readonly displaced_multiplier: Ratio;
  /**
   * Offer a reference token that `findDisplacedTokens` located in the vendor field as a
   * reference candidate. This IS the field-displacement recovery; switching it off is how a
   * sweep measures what the recovery is worth.
   */
  readonly include_displaced: boolean;
  /**
   * Offer `purchase_order_reference` as a reference candidate. DECLARED OFF. A purchase
   * order is a different document and several invoices legitimately share one, so a PO hit
   * is not evidence that THIS invoice was settled — it is evidence that one of a group was.
   */
  readonly include_purchase_order: boolean;
  /** Minimum digits before the digit view is allowed to claim agreement. */
  readonly digit_min_length: number;
  /** Compare digit strings again with leading zeros removed. Convention drift. */
  readonly digit_strip_leading_zeros: boolean;
  /** Which end of a digit string the other side is allowed to have dropped. */
  readonly digit_containment: DigitContainment;
  /**
   * Digit agreement at or above this may CARRY the component on its own.
   *
   * `TX/01021` and `tx01021` are the same document written twice, and no token rule can say
   * so: the second form never wrote the delimiter that would have made the tokens. Every
   * digit in the same order is the identity test that survives the drift, and the weighted
   * sum alone caps that evidence at `digit_weight`, which is not what it is worth.
   *
   * The threshold is what keeps it honest. A four-digit fragment sitting at the head of a
   * nine-digit invoice number agrees on 0.44 and carries nothing; a nine-digit number that
   * lost its last character agrees on 0.89 and carries the pairing.
   */
  readonly digit_carry_min: Ratio;
  /** What a carrying agreement is worth. Below 1 because a short number can coincide. */
  readonly digit_carry_multiplier: Ratio;
}

/**
 * One way of looking at the same two vendor strings.
 *
 * A bank narration mangles a vendor name in three independent ways at once — it truncates
 * it, it drops the spaces, and it surrounds it with rail furniture the noise table did not
 * catch — and no single comparator survives all three. So the comparison is declared as a
 * LIST of views and the component takes the best of them.
 *
 * `max` over views is monotone: adding a view can raise a score but can never make a
 * closer pair rank below a further one, which is the property that keeps the ranking
 * auditable by eye. The `multiplier` is how a view says it is weaker evidence than a
 * straight token match rather than being excluded outright.
 */
export interface VendorViewSpec {
  /** Stable name, so a sweep can report which view carried a decision. */
  readonly id: string;
  readonly comparator: ComparatorId;
  /** Compare with all whitespace removed first. */
  readonly despace: boolean;
  /** Applied to this view's similarity before the views are compared. */
  readonly multiplier: Ratio;
}

/**
 * Vendor identity, from a ledger name and a bank narration's leftovers.
 *
 * `AMBERKOTTECHWORK` against `amberkot techworks` scores near nothing token-wise and near
 * everything once both sides lose their whitespace; `girnaska marine services industries`
 * against `against tx girnaskamarinese` needs a partial view on top of that, because the
 * residue still carries boilerplate AND the name itself was cut off mid-word. Both cases are
 * views, not special cases in the code.
 */
export interface VendorScoreSpec {
  readonly views: readonly VendorViewSpec[];
  /** Similarity below this contributes nothing. */
  readonly floor: Ratio;
  readonly rescale_above_floor: boolean;
  /** Score when the payment side yielded no vendor residue at all. */
  readonly absent_score: Ratio;
  /** Score when both sides resolved to the same `VendorId` through the alias table. */
  readonly identity_score: Ratio;
}

/**
 * Which invoice date the payment is measured against.
 *
 * `invoice_date` is the default and is what the contract's `DateEvidence` compares, so the
 * evidence row and the score agree without explanation. `due_date` is the better domain
 * model where terms are reliable — a payment lands near the date it was due, not near the
 * date the invoice was raised — and a sweep can try it; when it is chosen, the evidence
 * reports the due date as the invoice-side value and names `invoice.due_date` as its path,
 * so a reviewer is never shown a delta measured against a date they cannot see.
 * `received_date` matters where the invoice sat in a pile before it was booked.
 */
export const DATE_ANCHORS = ['invoice_date', 'due_date', 'received_date'] as const;
export type DateAnchor = (typeof DATE_ANCHORS)[number];

/**
 * Date proximity, inside the frozen window. `window_days` is NOT here — it is
 * `policy.date_window_days` from eval/thresholds.json, and this spec only says what the
 * curve looks like inside it.
 */
export interface DateScoreSpec {
  /** Which invoice date to measure from. Falls back to `invoice_date` when null. */
  readonly anchor: DateAnchor;
  /**
   * A gap at or under this many days scores 1. Set to three weeks: on net-30 terms a
   * settlement lands three to five weeks after the invoice date, so anything inside three
   * weeks is as good as immediate and should not be scored as though it were late.
   */
  readonly ideal_days: Days;
  /** The score at the edge of the policy window. */
  readonly window_score: Ratio;
  /** Score outside the policy window. */
  readonly outside_score: Ratio;
  /**
   * Multiplier when the payment is dated BEFORE the invoice. An advance happens; it is
   * weaker evidence than a settlement after the fact and is scored as such.
   */
  readonly early_multiplier: Ratio;
  /** Score when either date is missing or malformed. */
  readonly absent_score: Ratio;
}

/**
 * How a set of payments collapses to one score per component, for the bulk-settlement case
 * W05c searches. One invoice settled by many payments is scored by the same code as one
 * settled by one; only these three rules differ.
 */
export interface SetAggregationSpec {
  /** Any payment carrying the reference is evidence, so `max`. */
  readonly reference: 'max' | 'mean' | 'min';
  /** EVERY payment should plausibly be from the vendor, so `min`. Conservative on purpose. */
  readonly vendor: 'max' | 'mean' | 'min';
  /** A settlement completes on its last payment, so `latest`. */
  readonly date: 'latest' | 'earliest' | 'nearest';
}

/**
 * Attribution of a monetary delta to a cause, at the paise level and no further.
 *
 * W05b owns delta attribution proper and may inject its own attributor; this default exists
 * because `AmountEvidence.cause` is not nullable and a candidate has to carry something.
 * It claims only what integer arithmetic supports. A zero delta is reported `unattributed`
 * — there is nothing to attribute, and inventing a cause for a zero teaches a reviewer to
 * stop reading the field.
 */
export interface DeltaAttributionSpec {
  /** |delta| at or below this is rounding. */
  readonly rounding_max_paise: Paise;
  /** A shortfall at or below this is a bank charge. */
  readonly bank_charge_max_paise: Paise;
  /** A shortfall at or below this proportion of gross is an early-payment discount. */
  readonly discount_max_ratio: Ratio;
  /** Statutory withholding rates to test a shortfall against, as proportions of gross. */
  readonly tds_ratios: readonly Ratio[];
  /** How close a shortfall must sit to a withholding rate to be called one. */
  readonly tds_tolerance_paise: Paise;
}

/** Deterministic ordering. Ties broken by data, never by array order or object key order. */
export const TIE_BREAK_KEYS = [
  'composite',
  'reference',
  'amount',
  'vendor',
  'date_proximity',
  'payment_ids',
] as const;
export type TieBreakKey = (typeof TIE_BREAK_KEYS)[number];

/** What the ranker retains and what it calls a tie. */
export interface RankingSpec {
  /**
   * Composite below this is not retained as a candidate. THE COMPARISON STILL HAPPENS —
   * every invoice is compared against every payment and `comparisons` reports the count.
   * This truncates the RETAINED list, which is a reporting bound, not a search bound.
   */
  readonly consider_min: Ratio;
  /** How many ranked candidates to retain per invoice. */
  readonly max_candidates_per_invoice: number;
  /**
   * Composite at or above which a candidate is ELIGIBLE to clear. Eligibility is not a
   * decision: engine/holds decides, and a held invoice cannot be paid whatever this says.
   */
  readonly accept_min: Ratio;
  /**
   * Two candidates within this composite distance are TIED. The SAP F.13 case — gross
   * agreeing to the paise with only the date window separating the rows — lands here, and
   * it is reported as `multiple_candidates_tied` rather than resolved by a coin flip.
   */
  readonly tie_epsilon: Ratio;
  readonly tie_break: readonly TieBreakKey[];
}

/** Severity per conflict code. Declared, so a family cannot quietly downgrade one. */
export type ConflictSeverityMap = Readonly<Partial<Record<ConflictCode, ConflictSeverity>>>;

/** Short fixed clauses. Not prose, not generated, not per-row. */
export type ConflictClauseMap = Readonly<Partial<Record<ConflictCode, string>>>;

// ─────────────────────────────────────────────────────────────────────────────
// The spec
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchSpec {
  /** Stable, versioned. Lands verbatim in `ScoreBreakdown.scorer_version`. */
  readonly id: string;
  readonly weights: ScoreWeights;
  readonly amount: AmountScoreSpec;
  readonly reference: ReferenceScoreSpec;
  readonly vendor: VendorScoreSpec;
  readonly date: DateScoreSpec;
  readonly aggregation: SetAggregationSpec;
  readonly attribution: DeltaAttributionSpec;
  readonly ranking: RankingSpec;
  readonly severities: ConflictSeverityMap;
  readonly clauses: ConflictClauseMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DECLARED WEIGHTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * They sum to 1, so the composite is a genuine proportion in [0, 1] and a reviewer can
 * reconstruct it by adding four numbers off the screen. `validateSpec` enforces the sum.
 *
 *   reference 0.40  the only field that identifies a document rather than describing one
 *   amount    0.35  second, because the whole adversarial set is built on amounts that
 *                   nearly agree — net of TDS, net of a bank charge, net of a discount
 *   vendor    0.15  corroborates; a bank narration truncates it, so it cannot lead
 *   date      0.10  separates, never selects. It is what breaks an F.13 tie and it must
 *                   not be able to carry a pair on its own
 */
export const WEIGHTS_V1: ScoreWeights = Object.freeze({
  reference: 0.4,
  amount: 0.35,
  vendor: 0.15,
  date: 0.1,
});

export const AMOUNT_SPEC_V1: AmountScoreSpec = Object.freeze({
  exact_paise: 0 as Paise,
  near_paise: 500_00 as Paise,
  near_ratio: 0.12,
  near_score: 0.55,
  zero_ratio: 0.5,
  over_multiplier: 0.6,
});

export const REFERENCE_SPEC_V1: ReferenceScoreSpec = Object.freeze({
  comparator: 'token_set_ratio',
  token_weight: 0.6,
  digit_weight: 0.4,
  floor: 0.6,
  rescale_above_floor: true,
  absent_score: 0,
  displaced_multiplier: 1,
  include_displaced: true,
  include_purchase_order: false,
  digit_min_length: 4,
  digit_strip_leading_zeros: true,
  digit_containment: 'either',
  digit_carry_min: 0.6,
  digit_carry_multiplier: 0.9,
});

/**
 * `tokens` is the brief's comparator and the one every profile in engine/normalise was
 * ordered for. `fused` recovers a narration that dropped the spaces. `contained` is the
 * truncated-and-surrounded case, discounted to 0.9 because finding a name INSIDE a longer
 * string is weaker evidence than the two strings agreeing.
 */
export const VENDOR_VIEWS_V1: readonly VendorViewSpec[] = Object.freeze([
  Object.freeze({ id: 'tokens', comparator: 'token_set_ratio', despace: false, multiplier: 1 }),
  Object.freeze({ id: 'fused', comparator: 'token_set_ratio', despace: true, multiplier: 1 }),
  Object.freeze({ id: 'contained', comparator: 'partial_ratio', despace: true, multiplier: 0.9 }),
] as const);

export const VENDOR_SPEC_V1: VendorScoreSpec = Object.freeze({
  views: VENDOR_VIEWS_V1,
  floor: 0.55,
  rescale_above_floor: true,
  absent_score: 0,
  identity_score: 1,
});

export const DATE_SPEC_V1: DateScoreSpec = Object.freeze({
  anchor: 'invoice_date',
  ideal_days: 21,
  window_score: 0.2,
  outside_score: 0,
  early_multiplier: 0.6,
  absent_score: 0,
});

export const AGGREGATION_V1: SetAggregationSpec = Object.freeze({
  reference: 'max',
  vendor: 'min',
  date: 'latest',
});

export const ATTRIBUTION_V1: DeltaAttributionSpec = Object.freeze({
  rounding_max_paise: 100 as Paise,
  bank_charge_max_paise: 60_00 as Paise,
  discount_max_ratio: 0.03,
  tds_ratios: Object.freeze([0.01, 0.02, 0.05, 0.1]),
  tds_tolerance_paise: 100 as Paise,
});

/**
 * `accept_min` is DERIVED, not picked: it is `weights.reference + weights.amount`.
 *
 * A pairing whose canonicalised reference is equal on both sides and whose settled sum
 * equals the invoice gross TO THE PAISE scores exactly 0.75 before the vendor and the date
 * contribute anything at all. That pairing must be eligible on its own merits — it is the
 * exact match the brief names as its own requirement — so the bar sits precisely there.
 * Everything short of both being exact has to earn the difference from corroboration.
 *
 * Change the weights in a sweep and this number should move with them, which is why the
 * derivation is written down rather than the arithmetic being left as a coincidence.
 */
export const RANKING_V1: RankingSpec = Object.freeze({
  consider_min: 0.25,
  max_candidates_per_invoice: 5,
  accept_min: 0.75,
  tie_epsilon: 0.02,
  tie_break: Object.freeze([
    'composite',
    'reference',
    'amount',
    'vendor',
    'date_proximity',
    'payment_ids',
  ] as const),
});

/**
 * `amount_over_cap` is BLOCKING: eval/thresholds.json derives `rupees_at_risk_max_paise`
 * from the cap on the stated ground that a false clear above the cap is impossible by
 * construction, because the cap forces human review regardless of score. That claim is only
 * true if this row stays blocking.
 */
export const SEVERITIES_V1: ConflictSeverityMap = Object.freeze({
  vendor_mismatch: 'material',
  vendor_below_similarity_floor: 'advisory',
  amount_over_tolerance: 'material',
  amount_over_cap: 'blocking',
  date_outside_window: 'material',
  reference_absent: 'material',
  reference_mismatch: 'material',
  reference_displaced: 'advisory',
  residual_unsettled: 'material',
  multiple_candidates_tied: 'material',
  no_candidate_found: 'material',
});

export const CLAUSES_V1: ConflictClauseMap = Object.freeze({
  vendor_mismatch: 'Vendor names do not correspond.',
  vendor_below_similarity_floor: 'Vendor similarity is below the declared floor.',
  amount_over_tolerance: 'Settled amount differs from the invoice beyond tolerance.',
  amount_over_cap: 'Invoice exceeds the amount cap; a named human reviews regardless of score.',
  date_outside_window: 'Payment date falls outside the settlement window.',
  reference_absent: 'No usable reference on one side of the pairing.',
  reference_mismatch: 'References do not correspond.',
  reference_displaced: 'Reference token was recovered from another field.',
  residual_unsettled: 'A residual remains after this settlement.',
  multiple_candidates_tied: 'Two or more candidates score within the tie window.',
  no_candidate_found: 'No payment scored above the retention floor.',
});

/** The default. Cited by id on every score it produces. */
export const MATCH_SPEC_V1: MatchSpec = Object.freeze({
  id: 'match.v1',
  weights: WEIGHTS_V1,
  amount: AMOUNT_SPEC_V1,
  reference: REFERENCE_SPEC_V1,
  vendor: VENDOR_SPEC_V1,
  date: DATE_SPEC_V1,
  aggregation: AGGREGATION_V1,
  attribution: ATTRIBUTION_V1,
  ranking: RANKING_V1,
  severities: SEVERITIES_V1,
  clauses: CLAUSES_V1,
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure edits — the search agent's whole surface area
// ─────────────────────────────────────────────────────────────────────────────

/**
 * New weights, new id. The id is not optional and there is no overload that omits it:
 * two strategies reporting the same `scorer_version` are indistinguishable in the report,
 * and an unattributable result is worse than a missing one.
 */
export function withWeights(base: MatchSpec, id: string, weights: ScoreWeights): MatchSpec {
  return { ...base, id, weights };
}

/** Any other part of the spec, same rule about the id. Returns a new spec; never mutates. */
export function withSpec(
  base: MatchSpec,
  id: string,
  overrides: Partial<Omit<MatchSpec, 'id'>>,
): MatchSpec {
  return { ...base, ...overrides, id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHT_SUM_EPSILON = 1e-9;

function ratioProblems(label: string, value: number, out: string[]): void {
  if (!Number.isFinite(value)) out.push(`${label} is not finite`);
  else if (value < 0 || value > 1) out.push(`${label} is ${value}, outside [0, 1]`);
}

/**
 * Structural problems a sweep harness should hear about BEFORE a run rather than after.
 * Returns an empty array for a sound spec. `assertSpec` throws on the same conditions, so a
 * mistyped variant fails loudly instead of quietly measuring the default.
 */
export function validateSpec(spec: MatchSpec): readonly string[] {
  const out: string[] = [];
  if (spec.id.trim() === '') out.push('spec id is empty');

  const w = spec.weights;
  for (const [k, v] of Object.entries(w)) ratioProblems(`weights.${k}`, v, out);
  const total = w.amount + w.reference + w.date + w.vendor;
  if (Math.abs(total - 1) > WEIGHT_SUM_EPSILON) {
    out.push(
      `weights sum to ${total}, not 1 — the composite would not be a proportion in [0, 1] ` +
        'and could not be audited by addition',
    );
  }

  ratioProblems('amount.near_ratio', spec.amount.near_ratio, out);
  ratioProblems('amount.near_score', spec.amount.near_score, out);
  ratioProblems('amount.zero_ratio', spec.amount.zero_ratio, out);
  ratioProblems('amount.over_multiplier', spec.amount.over_multiplier, out);
  if (spec.amount.near_ratio > spec.amount.zero_ratio) {
    out.push('amount.near_ratio exceeds amount.zero_ratio — the bands are inverted');
  }
  if (spec.amount.exact_paise > spec.amount.near_paise) {
    out.push('amount.exact_paise exceeds amount.near_paise — the bands are inverted');
  }

  const refTotal = spec.reference.token_weight + spec.reference.digit_weight;
  if (Math.abs(refTotal - 1) > WEIGHT_SUM_EPSILON) {
    out.push(`reference token_weight + digit_weight sum to ${refTotal}, not 1`);
  }
  ratioProblems('reference.floor', spec.reference.floor, out);
  ratioProblems('reference.absent_score', spec.reference.absent_score, out);
  ratioProblems('reference.displaced_multiplier', spec.reference.displaced_multiplier, out);
  ratioProblems('reference.digit_carry_min', spec.reference.digit_carry_min, out);
  ratioProblems('reference.digit_carry_multiplier', spec.reference.digit_carry_multiplier, out);
  if (spec.reference.digit_min_length < 1) out.push('reference.digit_min_length is below 1');

  ratioProblems('vendor.floor', spec.vendor.floor, out);
  ratioProblems('vendor.absent_score', spec.vendor.absent_score, out);
  ratioProblems('vendor.identity_score', spec.vendor.identity_score, out);
  if (spec.vendor.views.length === 0) {
    out.push('vendor.views is empty — every pair would score the absent value');
  }
  const viewIds = new Set<string>();
  for (const view of spec.vendor.views) {
    ratioProblems(`vendor.views.${view.id}.multiplier`, view.multiplier, out);
    if (viewIds.has(view.id)) out.push(`vendor.views declares "${view.id}" twice`);
    viewIds.add(view.id);
  }

  ratioProblems('date.window_score', spec.date.window_score, out);
  ratioProblems('date.outside_score', spec.date.outside_score, out);
  ratioProblems('date.early_multiplier', spec.date.early_multiplier, out);
  ratioProblems('date.absent_score', spec.date.absent_score, out);
  if (spec.date.ideal_days < 0) out.push('date.ideal_days is negative');

  ratioProblems('ranking.consider_min', spec.ranking.consider_min, out);
  ratioProblems('ranking.accept_min', spec.ranking.accept_min, out);
  ratioProblems('ranking.tie_epsilon', spec.ranking.tie_epsilon, out);
  if (spec.ranking.max_candidates_per_invoice < 1) {
    out.push('ranking.max_candidates_per_invoice is below 1 — no candidate could be retained');
  }
  if (spec.ranking.accept_min < spec.ranking.consider_min) {
    out.push('ranking.accept_min is below consider_min — an eligible candidate would be dropped');
  }
  if (!spec.ranking.tie_break.includes('payment_ids')) {
    out.push(
      'ranking.tie_break omits payment_ids — the final key must be total, or two runs can ' +
        'order equal candidates differently and disagree for a reason neither records',
    );
  }

  for (const r of spec.attribution.tds_ratios) ratioProblems('attribution.tds_ratios', r, out);
  ratioProblems('attribution.discount_max_ratio', spec.attribution.discount_max_ratio, out);

  return out;
}

/** Throws on the first sound reason not to run this variant. */
export function assertSpec(spec: MatchSpec): MatchSpec {
  const problems = validateSpec(spec);
  if (problems.length > 0) {
    throw new Error(`engine/match: spec "${spec.id}" is malformed:\n  ${problems.join('\n  ')}`);
  }
  return spec;
}

/** A conflict's declared severity. Unlisted codes are `material` — never silently advisory. */
export function severityOf(spec: MatchSpec, code: ConflictCode): ConflictSeverity {
  return spec.severities[code] ?? 'material';
}

/** A conflict's declared clause. Unlisted codes fall back to the code itself, never prose. */
export function clauseOf(spec: MatchSpec, code: ConflictCode): string {
  return spec.clauses[code] ?? code;
}

/** The delta causes this module's default attributor is willing to claim. */
export const ATTRIBUTABLE_CAUSES: readonly DeltaCause[] = Object.freeze([
  'rounding',
  'bank_charge',
  'early_payment_discount',
  'tds_withholding',
  'partial_settlement',
  'unattributed',
]);
