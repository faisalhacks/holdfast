/**
 * W10 — engine/rules. TOLERANCE CHANGES AS RULES, NOT AS ASSERTIONS.
 *
 * ─── The claim this directory backs ──────────────────────────────────────────────────
 *
 * Oracle documents three ways to correct a matching exception: change the invoice, change
 * the purchase order, or change the tolerance. The first two leave a document trail. The
 * third widens a number in configuration, the hold auto-releases, the invoice pays, and
 * nothing in the record says a person made a judgement.
 *
 * In HOLDFAST a tolerance change is a decision row — reviewer, reason, timestamp, and the
 * holds it released — written by `POST /api/tolerance-changes` and stored in a table whose
 * `direction` column is GENERATED, so the reviewer does not get to describe their own
 * edit. That much is the API's and the schema's.
 *
 * This directory adds the half that makes the row worth having: given a change and the
 * hold rows, WHICH HOLDS DOES IT GOVERN AND WHICH WOULD IT RELEASE — computed from static
 * rules rather than asserted by whoever clicked. A released set nobody can recompute is a
 * claim, not evidence.
 *
 * ─── The four modules ────────────────────────────────────────────────────────────────
 *
 *   direction.ts   loosened, tightened, neither, or not comparable. A `similarity`
 *                  tolerance is a FLOOR, so raising it NARROWS — the one case that is
 *                  backwards from the rest, and the one an audit view most needs right.
 *   governance.ts  the static kind -> hold-type reach table, every row carrying the engine
 *                  site that makes it true, plus the four hold types no tolerance reaches
 *                  and why. Asserts at module load that every hold type is one or the other.
 *   scope.ts       whether a hold sits inside the scope the reviewer declared.
 *   assess.ts      the rule itself: reach ∩ scope ∩ open ∩ widening ∩ auto-releasable,
 *                  and `reconcileRelease`, which tests a recorded released set against it.
 *
 * ─── What is deliberately absent ─────────────────────────────────────────────────────
 *
 * No repository, no clock, no module state, no mutation. Every function is a pure
 * statement about what the rules say, because the point of the rules is that an auditor
 * can recompute them and get the same answer. Nothing here releases a hold; it says what a
 * release would be entitled to look like, and something else does it, under a named
 * person's approval.
 */

export {
  TOLERANCE_DIRECTIONS,
  TOLERANCE_SENSE,
  describeDirection,
  describeTolerance,
  isWidening,
  toleranceDirection,
  type ToleranceSense,
} from './direction';

export {
  TOLERANCE_REACH,
  UNREACHED_HOLD_TYPES,
  governedHoldTypes,
  reachOf,
  releasableHoldTypes,
  type ReachBasis,
  type ReachRow,
  type UnreachedRow,
} from './governance';

export {
  describeScope,
  holdInScope,
  scopeBreadth,
  vendorResolver,
  type VendorResolver,
} from './scope';

export {
  TOLERANCE_RULES_VERSION,
  assessToleranceChange,
  reconcileRelease,
  type AssessedHold,
  type ReleaseOutcome,
  type ReleaseReconciliation,
  type ToleranceChangeAssessment,
  type ToleranceChangeInput,
  type WithheldReason,
} from './assess';

export { digitsOf, exactPaise, ratioOf, ratioOfCounts, sumPaise } from './paise';
