/**
 * W10 — which way a tolerance moved.
 *
 * This is one line of arithmetic and it is the single most load-bearing line in the
 * project. In the incumbent ERP, widening a tolerance auto-releases a matching hold and
 * nothing records that a judgement was made; the audit view we build exists to surface
 * exactly the loosenings. A view that files a tightening as a loosening — or, far worse,
 * a loosening as a tightening — is not a control, it is a decoration.
 *
 * THE ONE THAT IS BACKWARDS FROM THE OTHERS
 *
 * A `similarity` tolerance is a FLOOR: a candidate passes when its observed similarity is
 * AT OR ABOVE the declared value (`engine/match/components.ts` compares `observed >=
 * s.floor` on every component). Raising the number therefore makes the test HARDER, which
 * is a NARROWING. Every other kind is a CEILING — a delta passes when it is at or below
 * the declared value — so raising the number loosens.
 *
 * Two independent workers found this before us and the database encodes it too: the
 * GENERATED `tolerance_changes.direction` column in `db/migrations/007_tolerance_changes.sql`
 * inverts the same comparison for the same reason. Three implementations agreeing is not
 * redundancy; it is the reason the reviewer does not get to describe their own edit.
 *
 * WHAT A RETYPE IS, AND WHY IT IS NOT A DIRECTION
 *
 * `percentage 2%` -> `absolute_paise 1,00,000` is wider on a small invoice and narrower on
 * a large one. There is no direction without an invoice, so there is no direction: the
 * answer is `retyped`, and a retype releases nothing (see ./governance.ts). Reporting a
 * guess here would be the same failure as reporting a tightening as a widening.
 *
 * MONEY
 *
 * `absolute_paise` values are compared in `bigint`. A tolerance is money and money is an
 * integer count of paise; comparing two of them through a float is the rounding bug this
 * codebase refuses everywhere else, and refusing it in a two-line comparison costs nothing.
 */

import type { Tolerance, ToleranceDirection } from '@/lib/types';
import { exactPaise } from './paise';

/** Every value `toleranceDirection` can return. Mirrors `ToleranceDirection`. */
export const TOLERANCE_DIRECTIONS: readonly ToleranceDirection[] = Object.freeze([
  'widened',
  'narrowed',
  'unchanged',
  'retyped',
]);

/**
 * Which way the declared number points.
 *
 * `ceiling` — a delta passes when it is at or below the value, so a larger value loosens.
 * `floor`   — an observation passes when it is at or above the value, so a larger value
 *             tightens.
 * `none`    — `exact` carries no number at all; there is nothing to move.
 */
export type ToleranceSense = 'ceiling' | 'floor' | 'none';

export const TOLERANCE_SENSE: Readonly<Record<Tolerance['kind'], ToleranceSense>> =
  Object.freeze({
    exact: 'none',
    absolute_paise: 'ceiling',
    percentage: 'ceiling',
    days: 'ceiling',
    // The inversion. See the header.
    similarity: 'floor',
  });

/** -1, 0 or 1 for `b` against `a`, in whichever numeric domain the kind lives in. */
function compareValues(from: Tolerance, to: Tolerance): -1 | 0 | 1 {
  if (from.kind === 'absolute_paise' && to.kind === 'absolute_paise') {
    const a = exactPaise(from.value);
    const b = exactPaise(to.value);
    return b > a ? 1 : b < a ? -1 : 0;
  }
  if (from.kind !== 'exact' && to.kind !== 'exact') {
    return to.value > from.value ? 1 : to.value < from.value ? -1 : 0;
  }
  return 0;
}

/**
 * Loosened, tightened, neither, or not comparable.
 *
 * Agrees, case for case, with `toleranceDirection` in `app/api/_lib/tolerance.ts` and with
 * the GENERATED `direction` column in `db/migrations/007_tolerance_changes.sql`. That
 * agreement is deliberate and must survive: an audit row whose direction depends on which
 * layer answered is worse than no row.
 */
export function toleranceDirection(from: Tolerance, to: Tolerance): ToleranceDirection {
  if (from.kind !== to.kind) return 'retyped';
  const sense = TOLERANCE_SENSE[to.kind];
  if (sense === 'none') return 'unchanged';

  const moved = compareValues(from, to);
  if (moved === 0) return 'unchanged';
  const larger = moved === 1;
  // A ceiling loosens as it rises. A floor tightens as it rises.
  return sense === 'ceiling'
    ? larger
      ? 'widened'
      : 'narrowed'
    : larger
      ? 'narrowed'
      : 'widened';
}

/**
 * True only for a genuine loosening. Deliberately NOT `direction !== 'narrowed'`: a
 * `retyped` change has no direction and an `unchanged` one moved nothing, and treating
 * either as a widening is how a hold gets released by an edit that did not license it.
 */
export function isWidening(direction: ToleranceDirection): boolean {
  return direction === 'widened';
}

/** Short fixed clause for the audit list. Not generated prose. */
export function describeDirection(direction: ToleranceDirection): string {
  switch (direction) {
    case 'widened':
      return 'loosened — the test now admits deltas it previously refused';
    case 'narrowed':
      return 'tightened — the test now refuses deltas it previously admitted';
    case 'unchanged':
      return 'the declared quantity did not move';
    case 'retyped':
      return 'the tolerance changed kind; wider on some documents and narrower on others, so it has no single direction';
    default:
      return 'unrecognised direction';
  }
}

/**
 * Human-readable rendering of a tolerance, for the audit list. Money stays in paise and is
 * never formatted into rupees here — a display unit is a presentation decision and this is
 * the record, not the screen.
 */
export function describeTolerance(tolerance: Tolerance): string {
  switch (tolerance.kind) {
    case 'exact':
      return 'exact (no band)';
    case 'absolute_paise':
      return `${exactPaise(tolerance.value).toString()} paise`;
    case 'percentage':
      return `${tolerance.value} of the compared quantity`;
    case 'days':
      return `${tolerance.value} day(s)`;
    case 'similarity':
      return `similarity floor ${tolerance.value}`;
    default:
      return 'unrecognised tolerance';
  }
}
