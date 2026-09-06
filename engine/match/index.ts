// W04b — engine/match. Public surface.
//
// Candidate generation and scoring. One invoice against a set of payments, scored by four
// declared components, ranked by a total order, and handed on as the frozen contract's
// `MatchCandidate`.
//
// ─── WHAT THIS MODULE IS ─────────────────────────────────────────────────────────────
//
//   prepareLedger(invoices, payments, normaliseConfig)   normalise once, from RAW columns
//   matchLedger(ledger, ctx)                             full cross-product, ranked
//   scorePairing(invoice, payments, ctx)                 the only place a composite is made
//   reverify(proposal, ledger, ctx)                      a nomination, re-scored on its merits
//   exactPairings(ledger, ctx)                           (reference, amount) equal, checkable
//
// ─── WHAT THIS MODULE IS NOT ─────────────────────────────────────────────────────────
//
// It raises no holds and clears nothing. `ranking.accept_min` says a candidate is ELIGIBLE;
// engine/holds decides, and a held invoice cannot be paid however well it scored. It does no
// subset search either — bounded subset-sum for bulk settlement is W05c's, and every subset
// it tries comes back through `scorePairing` and is judged by the same four components.
//
// ─── THE INTERFACE W05a / W05b / W05c CONSUME ────────────────────────────────────────
//
// `engine/holds/registry.ts` declares `HoldContext.candidates: readonly MatchCandidate[]`,
// "ranked candidates from engine/match, read-only". That is `MatchResult.by_invoice[i]
// .candidates` — already ranked, `rank` starting at 1, `reverified` true, each carrying a
// full `ScoreBreakdown` (the four components, the weights that produced them, the composite
// and the scorer id), a full `EvidenceSet` (both sides' values, the delta in that field's own
// units, the tolerance applied, and whether it was met) and its `Conflict[]`.
//
// Also exported for them: `exceedsAmountCap` and `insideWindow`, which read the FROZEN policy
// block and nothing else, and `nearBand`, the paise tolerance band a delta was judged
// against — so a variance family reports the same bound the scorer used rather than
// re-deriving one that drifts.
//
// ─── SWAPPING A STRATEGY ─────────────────────────────────────────────────────────────
//
// Two independent axes, both pure data, neither requiring a line of this module to change:
//
//   NORMALISATION  prepareLedger(invoices, payments, withConfig(DEFAULT_CONFIG, { profiles }))
//   SCORING        withWeights(MATCH_SPEC_V1, 'match.v1+ref-heavy', { ... })
//                  withSpec(MATCH_SPEC_V1, 'match.v1+partial-vendor', { vendor: { ... } })
//
// Every weight, band, floor, comparator, aggregation rule, tie window and retention bound is
// declared in spec.ts. `validateSpec` rejects a malformed variant before it runs, and the
// spec id lands on `ScoreBreakdown.scorer_version` for every score it produced, so a figure
// in a report names the strategy behind it.
//
// ─── REPRODUCIBILITY ─────────────────────────────────────────────────────────────────
//
// No clock: `MatchContext.now` is supplied by the caller. No randomness. No cache — a memo
// keyed on anything a caller cannot see makes two sweep runs disagree for a reason neither
// run records, which is the one failure a parallel search cannot recover from. The ordering
// is total by declaration, so equal-scoring candidates cannot come back in a different order
// on a second run.
//
// ─── ABSENT BY DESIGN ────────────────────────────────────────────────────────────────
//
// A model's own stated certainty is not an input to any of this and there is no field for one
// anywhere under engine/match. A generated pairing is a `CandidateProposal` — ids and a
// provenance — and it becomes a candidate only by going through the same scorer as everything
// else. Money is integer paise end to end; no value here is ever a float or a string.

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  CandidateProposal,
  ComponentOutcome,
  InvoiceCandidates,
  MatchContext,
  MatchResult,
  PreparedInvoice,
  PreparedLedger,
  PreparedPayment,
  ReferenceSource,
  ReferenceView,
  ScoredPairing,
  VendorView,
} from './types';
export { REFERENCE_SOURCES } from './types';

// ── The declared spec ────────────────────────────────────────────────────────
export type {
  AmountScoreSpec,
  ConflictClauseMap,
  ConflictSeverityMap,
  DateAnchor,
  DateScoreSpec,
  DeltaAttributionSpec,
  MatchSpec,
  RankingSpec,
  ReferenceScoreSpec,
  SetAggregationSpec,
  TieBreakKey,
  VendorScoreSpec,
  VendorViewSpec,
} from './spec';
export {
  AGGREGATION_V1,
  AMOUNT_SPEC_V1,
  ATTRIBUTABLE_CAUSES,
  ATTRIBUTION_V1,
  CLAUSES_V1,
  DATE_ANCHORS,
  DATE_SPEC_V1,
  MATCH_SPEC_V1,
  RANKING_V1,
  REFERENCE_SPEC_V1,
  SEVERITIES_V1,
  TIE_BREAK_KEYS,
  VENDOR_SPEC_V1,
  VENDOR_VIEWS_V1,
  WEIGHTS_V1,
  assertSpec,
  clauseOf,
  severityOf,
  validateSpec,
  withSpec,
  withWeights,
} from './spec';

// ── The frozen policy block ──────────────────────────────────────────────────
export type { MatchPolicy } from './policy';
export { exceedsAmountCap, insideWindow, parsePolicy } from './policy';

// ── Money and dates ──────────────────────────────────────────────────────────
export { absPaise, asPaise, deltaPaise, maxPaise, scalePaise, sumPaise } from './money';
export { dayDelta, dayIndex } from './dates';

// ── Similarity ───────────────────────────────────────────────────────────────
export type { ComparatorId, DigitAgreementSpec, DigitContainment } from './similarity';
export {
  COMPARATORS,
  DEFAULT_COMPARATOR,
  DIGIT_CONTAINMENTS,
  clampRatio,
  compare,
  despace,
  digitAgreement,
} from './similarity';

// ── Preparation — normalise once, from the raw columns ───────────────────────
export { FIELD_PATHS, prepareInvoice, prepareLedger, preparePayment } from './prepare';

// ── Components ───────────────────────────────────────────────────────────────
export type { AmountOutcome, DateOutcome, ReferenceOutcome, VendorOutcome } from './components';
export {
  admissibleReferences,
  amountComponent,
  attributeDelta,
  dateAnchorOf,
  dateComponentFor,
  nearBand,
  referenceComponentFor,
  vendorComponentFor,
} from './components';

// ── Scoring ──────────────────────────────────────────────────────────────────
export {
  buildBreakdown,
  cardinalityOf,
  isExactPairing,
  pairingKey,
  residualOf,
  scorePairing,
} from './score';

// ── Conflicts ────────────────────────────────────────────────────────────────
export type { ConflictInput } from './conflicts';
export { conflictsFor, noCandidateConflict, tiedCandidatesConflict } from './conflicts';

// ── Candidates ───────────────────────────────────────────────────────────────
export {
  contestedPayments,
  exactPairings,
  generateForInvoice,
  matchLedger,
  rankPairings,
  reverify,
  reverifyAll,
} from './candidates';
