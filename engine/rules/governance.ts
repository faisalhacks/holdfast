/**
 * W10 — WHICH HOLDS A TOLERANCE GOVERNS.
 *
 * Oracle documents three ways to correct a matching exception: change the invoice, change
 * the purchase order, or change the tolerance. The third is the one that leaves no trace
 * that anyone decided anything — the hold lifts, the invoice pays, and the record shows a
 * configuration value that is now simply different. That is the failure this file exists
 * to close.
 *
 * Closing it needs more than a decision row. A decision row that says "this change
 * released holds h1, h2 and h7" is only as good as whoever typed it. The released set has
 * to be RECONSTRUCTIBLE: given the change and the hold rows, the rules alone must say
 * which holds it reached and which it lifted, so an auditor can recompute the claim rather
 * than accept it.
 *
 * ─── REACH: a static kind -> hold-type table, intersected with the declared scope ─────
 *
 * A tolerance kind reaches a hold type when the condition that RAISES that hold is tested
 * against a tolerance of that kind. Every row below names the engine site that makes it
 * true, and each row carries a `basis`:
 *
 *   declared    the engine declares a `Tolerance` of this kind on the test that raises
 *               this hold. Moving it changes outcomes today.
 *   admissible  the quantity is measured in this kind's units, but the engine currently
 *               declares the test `exact` or structural. A change of this kind is
 *               recorded and is shown against the hold — and releases nothing, because
 *               there is no band for it to move. See RELEASE below.
 *
 * ─── FOUR HOLD TYPES NO TOLERANCE REACHES ────────────────────────────────────────────
 *
 * Named explicitly, with the reason, in `UNREACHED_HOLD_TYPES`. An absence that is only an
 * absence gets filled in by the next person who reads the table; an absence with a clause
 * attached survives.
 *
 * ─── RELEASE: reach is necessary and nowhere near sufficient ──────────────────────────
 *
 * A hold lifts on a tolerance change only when ALL of the following hold. Anything else is
 * governed-but-withheld and carries a typed reason.
 *
 *   1. the hold is open
 *   2. the hold sits inside the declared scope
 *   3. the changed kind reaches the hold's type with basis `declared`
 *   4. the change is a WIDENING — never a narrowing, never a retype, never `unchanged`
 *   5. `HOLD_POLICY` declares the type `auto_releasable`
 *
 * Rule 4 is the one that would be easiest to get wrong and the most damaging: a tightening
 * that released holds would be a tolerance change doing the opposite of what it says.
 *
 * Rule 5 is the one that matters in the room. `duplicate_candidate` is never reached at
 * all, and the blocking tax holds are reached but not auto-releasable, so a widened
 * tolerance never lifts them — it becomes the recorded REASON a named person may release
 * one, which is a different act with a different author. The tolerance change is never
 * itself the release.
 */

import { HOLD_POLICY } from '@/engine/holds/registry';
import { HOLD_TYPES } from '@/lib/types';
import type { HoldType, ToleranceKind } from '@/lib/types';

/** Whether the engine declares a band of this kind today, or only could. */
export type ReachBasis = 'declared' | 'admissible';

export interface ReachRow {
  readonly kind: ToleranceKind;
  readonly hold_type: HoldType;
  readonly basis: ReachBasis;
  /** The fixed clause naming the engine site that makes this row true. */
  readonly because: string;
}

/**
 * The table. Ordered by kind, then by hold type, so a diff of this file reads as a policy
 * change rather than a reshuffle.
 */
export const TOLERANCE_REACH: readonly ReachRow[] = Object.freeze([
  // ── similarity — a FLOOR. Raising it narrows. ──────────────────────────────────────
  {
    kind: 'similarity',
    hold_type: 'matching',
    basis: 'declared',
    because:
      'engine/match/spec.ts declares reference, vendor and ranking floors; a candidate below the ranking floor is what `matching` reports',
  },
  {
    kind: 'similarity',
    hold_type: 'no_reference',
    basis: 'declared',
    because:
      'the reference floor decides whether a token on the bank line counts as a reference at all, which is the whole difference between the two matching-family codes',
  },

  // ── days — the date window on the candidate search ────────────────────────────────
  {
    kind: 'days',
    hold_type: 'matching',
    basis: 'declared',
    because:
      'the date evidence row carries a days tolerance; a payment outside the window scores nothing and no candidate clears',
  },
  {
    kind: 'days',
    hold_type: 'no_reference',
    basis: 'declared',
    because:
      '`no_reference` needs a line that settles the invoice on money, and a line outside the window is not offered as a candidate',
  },

  // ── absolute_paise — money bands ──────────────────────────────────────────────────
  {
    kind: 'absolute_paise',
    hold_type: 'matching',
    basis: 'declared',
    because:
      'the amount evidence row carries an absolute_paise near band; widening it admits deltas the scorer currently refuses',
  },
  {
    kind: 'absolute_paise',
    hold_type: 'no_reference',
    basis: 'declared',
    because:
      'the same near band decides whether the money reconciles, which `no_reference` asserts and `matching` does not',
  },
  {
    kind: 'absolute_paise',
    hold_type: 'tax_amount_range',
    basis: 'declared',
    because:
      'engine/holds/variance/tolerances.ts declares TAX_AMOUNT_RANGE_TOLERANCE as an absolute paise band, and a breach of it IS this hold code',
  },
  {
    kind: 'absolute_paise',
    hold_type: 'tax_variance',
    basis: 'declared',
    because:
      'the CGST/SGST half-split allowance is an absolute paise band, and a breach of it raises tax_variance',
  },
  {
    kind: 'absolute_paise',
    hold_type: 'price_variance',
    basis: 'admissible',
    because:
      'the settled amount is compared exactly today — there is deliberately no auto-write-off band — so a paise band is the shape such a change would take and nothing more',
  },
  {
    kind: 'absolute_paise',
    hold_type: 'cardinality_residual',
    basis: 'admissible',
    because:
      'the residual is money, but the settlement test is structural and declares no band of its own',
  },

  // ── percentage — proportional bands ───────────────────────────────────────────────
  {
    kind: 'percentage',
    hold_type: 'tax_variance',
    basis: 'declared',
    because:
      'TAX_RATE_TOLERANCE is a percentage band against the tax implied by the statutory rate, and a breach of it IS this hold code',
  },
  {
    kind: 'percentage',
    hold_type: 'price_variance',
    basis: 'declared',
    because:
      'the settlement attribution ceiling is a proportion of gross and decides whether a delta is a priced variance at all or a failed match',
  },
  {
    kind: 'percentage',
    hold_type: 'matching',
    basis: 'declared',
    because:
      'the amount near band is declared as a proportion of gross as well as in paise, and the wider of the two applies',
  },
  {
    kind: 'percentage',
    hold_type: 'no_reference',
    basis: 'declared',
    because: 'the same proportional near band decides whether the money reconciles',
  },
  {
    kind: 'percentage',
    hold_type: 'quantity_variance',
    basis: 'admissible',
    because:
      'a quantity tolerance is conventionally a proportion of the ordered quantity; this engine has no purchase-order lines and raises no quantity variance today',
  },
  {
    kind: 'percentage',
    hold_type: 'cardinality_residual',
    basis: 'admissible',
    because:
      'a residual band expressed as a proportion of gross is admissible; the settlement test declares none',
  },

  // ── exact — deliberately reaches nothing ──────────────────────────────────────────
  // An `exact` tolerance carries no number, so there is nothing to move. A change TO or
  // FROM `exact` is a `retyped` change: recorded, shown, and releasing nothing.
]);

export interface UnreachedRow {
  readonly hold_type: HoldType;
  readonly because: string;
}

/**
 * The hold types no tolerance change reaches, each with the reason. Absences with clauses
 * attached survive; bare absences get filled in by the next reader.
 */
export const UNREACHED_HOLD_TYPES: readonly UnreachedRow[] = Object.freeze([
  {
    hold_type: 'duplicate_candidate',
    because:
      'the duplicate family compares payables with payables and never looks at a payment, a candidate or a tolerance; the near-date window it uses is frozen policy, not a reviewer-changeable band. Making a fraud control depend on the matcher is how widening a tolerance quietly dissolves it.',
  },
  {
    hold_type: 'dist_variance',
    because:
      'gross = net + tax is an accounting identity, not a target. The declared tolerance is `exact` and an identity has no band.',
  },
  {
    hold_type: 'period_deferral',
    because:
      'the test is equality of accounting periods. A days band cannot move it — no window makes March equal April.',
  },
  {
    hold_type: 'credit_note_crossing',
    because:
      'the same period-equality test, on a credit note that crosses a close. Which period wears it is a judgement, not a band.',
  },
]);

const REACH_BY_KIND = new Map<ToleranceKind, readonly ReachRow[]>();
for (const row of TOLERANCE_REACH) {
  REACH_BY_KIND.set(row.kind, [...(REACH_BY_KIND.get(row.kind) ?? []), row]);
}

const REACH_BY_PAIR = new Map<string, ReachRow>(
  TOLERANCE_REACH.map((row) => [`${row.kind}::${row.hold_type}`, row]),
);

/** The reach row for one pair, or null when this kind does not reach this hold type. */
export function reachOf(kind: ToleranceKind, holdType: HoldType): ReachRow | null {
  return REACH_BY_PAIR.get(`${kind}::${holdType}`) ?? null;
}

/** Every hold type a tolerance of this kind reaches, in table order. */
export function governedHoldTypes(kind: ToleranceKind): readonly HoldType[] {
  return (REACH_BY_KIND.get(kind) ?? []).map((row) => row.hold_type);
}

/**
 * Every hold type a tolerance of this kind can actually LIFT: reached with basis
 * `declared`, and declared `auto_releasable` by the frozen hold registry. This is a strict
 * subset of `governedHoldTypes` and the gap between the two is the point — the rest are
 * governed by the change and released by a named person, if at all.
 */
export function releasableHoldTypes(kind: ToleranceKind): readonly HoldType[] {
  return (REACH_BY_KIND.get(kind) ?? [])
    .filter((row) => row.basis === 'declared' && HOLD_POLICY[row.hold_type].auto_releasable)
    .map((row) => row.hold_type);
}

/**
 * Every hold type is either reached by some tolerance kind or explicitly named as
 * unreached. Checked at module load, not in a test — the same discipline
 * `engine/holds/registry.ts` applies to its policy table, and for the same reason: adding
 * a hold type must fail loudly here rather than silently fall outside every rule.
 */
const REACHED = new Set(TOLERANCE_REACH.map((row) => row.hold_type));
const UNREACHED = new Set(UNREACHED_HOLD_TYPES.map((row) => row.hold_type));
for (const type of HOLD_TYPES) {
  const reached = REACHED.has(type);
  const unreached = UNREACHED.has(type);
  if (reached === unreached) {
    throw new Error(
      `tolerance rules: hold type "${type}" is ${reached ? 'both reached and named unreached' : 'neither reached by any tolerance kind nor named in UNREACHED_HOLD_TYPES'}. ` +
        'Every hold type must be one or the other, with a clause saying which.',
    );
  }
}
