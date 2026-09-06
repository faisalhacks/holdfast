// W04b — the types this module owns.
//
// `lib/types.ts` is the contract and is frozen; nothing here redefines any part of it.
// `MatchCandidate`, `ScoreBreakdown`, `ScoreWeights`, `ScoreComponent`, `EvidenceSet` and
// `Conflict` all come from there, unchanged. What lives in this file is the machinery
// around them: the once-per-run normalised view of the ledger, the context a scoring call
// needs, and the shape of a scored pairing before it becomes a contract object.
//
// ABSENT BY DESIGN. There is no field anywhere under engine/match carrying a model's own
// stated certainty, and there is nowhere in the frozen contract to put one either. A
// generated pairing arrives as a `CandidateProposal`, goes through `reverify`, and comes
// back as a `MatchCandidate` scored by the same four components as every other candidate —
// or it does not come back at all.

import type {
  CardinalityKind,
  Conflict,
  EvidenceSet,
  FieldPath,
  Invoice,
  InvoiceId,
  IsoTimestamp,
  MatchCandidate,
  NormalisationNote,
  Paise,
  Payment,
  PaymentId,
  ProposalSource,
  Ratio,
  RunId,
  ScoreBreakdown,
  ScoreWeights,
  VendorId,
} from '@/lib/types';
import type { NormaliseConfig, NormaliseField } from '@/engine/normalise';
import type { MatchPolicy } from './policy';
import type { MatchSpec } from './spec';

// ─────────────────────────────────────────────────────────────────────────────
// The normalised view of one record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One reference-shaped string from one record, canonicalised.
 *
 * A record offers several. An invoice carries its own reference, optionally a purchase
 * order reference, and sometimes a reference token sitting in the vendor name — the field
 * displacement case. A bank line carries whatever `extractFromNarration` recovered. Which
 * of them wins is decided by the score, not by position, because choosing before comparing
 * is how a matcher picks the wrong token confidently.
 */
export const REFERENCE_SOURCES = [
  /** The record's own reference field. */
  'reference_field',
  /** `Invoice.purchase_order_reference`. A different document; off by default. */
  'purchase_order',
  /** Recovered by `findDisplacedTokens` from a vendor field. The displacement case. */
  'displaced_from_vendor',
  /** Recovered from a bank narration by `extractFromNarration`. */
  'narration_token',
] as const;
export type ReferenceSource = (typeof REFERENCE_SOURCES)[number];

export interface ReferenceView {
  /** Where this token was found. The spec decides which sources are admissible. */
  readonly source: ReferenceSource;
  /** The canonicalised value, through `reference.v1`. */
  readonly value: string;
  /** Every digit of the raw token, in order. The bridge across convention drift. */
  readonly digits: string;
  /** The input, verbatim. A reviewer always sees this. */
  readonly raw: string;
  /** True when this token was recovered from a field that does not hold references. */
  readonly displaced: boolean;
  /** The field it was actually found in. Null unless `displaced`. */
  readonly displaced_from: FieldPath | null;
  readonly note: NormalisationNote | null;
}

/** One record's vendor name, canonicalised through `vendor.v1` on BOTH sides. */
export interface VendorView {
  readonly value: string;
  readonly raw: string;
  /** Set only when the alias table pinned an identity. Null otherwise. */
  readonly vendor_id: VendorId | null;
  readonly note: NormalisationNote | null;
}

export interface PreparedInvoice {
  readonly invoice: Invoice;
  readonly invoice_id: InvoiceId;
  readonly gross_paise: Paise;
  readonly references: readonly ReferenceView[];
  readonly vendor: VendorView;
  /** Whole days since the epoch, UTC. Null when the date is not a calendar date. */
  readonly day_index: number | null;
  /** The same, for `due_date` and `received_date`. `DateScoreSpec.anchor` picks one. */
  readonly due_day_index: number | null;
  readonly received_day_index: number | null;
}

export interface PreparedPayment {
  readonly payment: Payment;
  readonly payment_id: PaymentId;
  readonly amount_paise: Paise;
  readonly references: readonly ReferenceView[];
  readonly vendor: VendorView;
  readonly day_index: number | null;
}

/**
 * The whole ledger, normalised ONCE, by the caller, explicitly.
 *
 * There is no cache under engine/match and there is not going to be one. A memo keyed on
 * anything a caller cannot see makes two sweep runs disagree for a reason neither run
 * records, which is the one failure mode a parallel search cannot recover from. If a caller
 * wants to reuse this work it holds this value and passes it in again — visibly.
 */
export interface PreparedLedger {
  readonly invoices: readonly PreparedInvoice[];
  readonly payments: readonly PreparedPayment[];
  /**
   * The same records, by id. Built once, in the open, from the arrays above — this is an
   * index over data the caller can see, not a memo of work it cannot. W05c's subset search
   * needs to turn a set of payment ids into `PreparedPayment` values on every candidate
   * subset it tries, and a linear scan per lookup would be the only reason that search felt
   * slow.
   */
  readonly invoices_by_id: ReadonlyMap<InvoiceId, PreparedInvoice>;
  readonly payments_by_id: ReadonlyMap<PaymentId, PreparedPayment>;
  /** The normalisation strategy that produced this view. Reported beside every result. */
  readonly normalise_config: NormaliseConfig;
  /** Profile id per field, so a sweep entry is attributable from the result alone. */
  readonly profile_ids: Readonly<Record<NormaliseField, string>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything a scoring call may see. The declared spec, the frozen policy, the run it
 * belongs to, and the instant to stamp.
 *
 * `now` is SUPPLIED, never read from a clock. A matcher that calls `Date.now()` produces a
 * different `MatchCandidate` for the same frozen input tomorrow, and every sweep comparison
 * across a midnight becomes meaningless for a reason no run records.
 */
export interface MatchContext {
  readonly run_id: RunId;
  readonly spec: MatchSpec;
  readonly policy: MatchPolicy;
  readonly now: IsoTimestamp;
}

/** One component's raw inputs, kept so the evidence row and the score cannot disagree. */
export interface ComponentOutcome {
  readonly score: Ratio;
  /** The similarity or delta actually observed, before the spec's curve was applied. */
  readonly observed: Ratio;
}

/**
 * A scored pairing, before it becomes a contract `MatchCandidate`.
 *
 * `exact` records that the pairing cleared the exact test — reference equal after
 * canonicalisation AND settled amount equal to the invoice gross to the paise — which is
 * what separates `deterministic_exact` from `deterministic_fuzzy` on the candidate.
 */
export interface ScoredPairing {
  readonly invoice_id: InvoiceId;
  readonly payment_ids: readonly PaymentId[];
  readonly score: ScoreBreakdown;
  readonly evidence: EvidenceSet;
  readonly conflicts: readonly Conflict[];
  /** Invoice gross minus the settled sum. Zero on a full settlement. Signed. */
  readonly residual_paise: Paise;
  readonly settled_paise: Paise;
  readonly cardinality: CardinalityKind;
  readonly exact: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One invoice's ranked candidates.
 *
 * `comparisons` is the count of pairings actually evaluated for this invoice. It is
 * reported rather than assumed because the claim "no blocking" is only worth making if it
 * is checkable: for a full cross-product it equals the payment count, every time, for every
 * invoice. A number below that is a bug or a blocking scheme somebody added quietly.
 */
export interface InvoiceCandidates {
  readonly invoice_id: InvoiceId;
  readonly candidates: readonly MatchCandidate[];
  /** Ranking-level conflicts: nothing retained, or a tie at the top. */
  readonly conflicts: readonly Conflict[];
  readonly comparisons: number;
}

export interface MatchResult {
  readonly run_id: RunId;
  /** The spec id. Also on every `ScoreBreakdown.scorer_version` in this result. */
  readonly scorer_version: string;
  /** The declared weights, reported alongside the scores they produced. */
  readonly weights: ScoreWeights;
  readonly profile_ids: Readonly<Record<NormaliseField, string>>;
  readonly by_invoice: readonly InvoiceCandidates[];
  /** Total pairings evaluated. Equals invoices x payments for a full cross-product. */
  readonly comparisons: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A nominated pairing from anywhere — a feedback rule, a cardinality search, or a generated
 * proposal. It carries ids and a provenance and NOTHING ELSE. In particular it carries no
 * score: a proposal that arrived with one would be asking to be believed, and the rule of
 * the house is that it re-enters the same deterministic scorer as any other candidate and is
 * discarded if it does not clear on its own merits.
 */
export interface CandidateProposal {
  readonly invoice_id: InvoiceId;
  readonly payment_ids: readonly PaymentId[];
  readonly proposed_by: ProposalSource;
  /**
   * Set only when the proposer knows something the pair scorer cannot: `many_to_one` and
   * `partial` need cross-invoice knowledge, which is W05c's, not this module's.
   */
  readonly cardinality?: CardinalityKind;
}
