// Routing policy: given the typed holds on a case, who should act next.
//
// This is a SUGGESTION and every response labels it as one. The reviewer chooses; the
// contract records their choice in `Decision.owner_next` and `Decision.resolution_path`.
// The map is a static enum-to-enum table with no numbers in it: it is policy, not a
// metric, and nothing here scores, ranks or clears anything.
//
// Ordering matters. A case usually carries more than one hold and the routing must be
// deterministic, so hold types are ranked and the highest-ranked one on the case decides.

import { governedHoldTypes } from '@/engine/rules';
import type {
  HoldType,
  OwnerRole,
  ResolutionPath,
  ToleranceKind,
} from '@/lib/types';

export interface RoutingRule {
  readonly hold_type: HoldType;
  readonly owner_role: OwnerRole;
  readonly resolution_path: ResolutionPath;
  /** The short fixed clause explaining why this role, not generated prose. */
  readonly because: string;
}

/**
 * Highest precedence first. A duplicate candidate outranks a variance because paying the
 * same document twice is a larger error than paying it for slightly the wrong amount.
 */
export const ROUTING_RULES: readonly RoutingRule[] = [
  {
    hold_type: 'duplicate_candidate',
    owner_role: 'ap_manager',
    resolution_path: 'internal_correction',
    because: 'a second document with the same vendor, amount and date is in the run',
  },
  {
    hold_type: 'credit_note_crossing',
    owner_role: 'controller',
    resolution_path: 'internal_correction',
    because: 'a credit note settles against a document in another accounting period',
  },
  {
    hold_type: 'period_deferral',
    owner_role: 'controller',
    resolution_path: 'internal_correction',
    because: 'the settlement falls outside the invoice accounting period',
  },
  {
    hold_type: 'tax_variance',
    owner_role: 'tax_team',
    resolution_path: 'internal_correction',
    because: 'the tax split does not reconcile to the stated total',
  },
  {
    hold_type: 'tax_amount_range',
    owner_role: 'tax_team',
    resolution_path: 'internal_correction',
    because: 'the tax amount falls outside the absolute band for this document',
  },
  {
    hold_type: 'dist_variance',
    owner_role: 'controller',
    resolution_path: 'internal_correction',
    because: 'distribution lines do not sum to the document total',
  },
  {
    hold_type: 'price_variance',
    owner_role: 'requisitioner',
    resolution_path: 'internal_correction',
    because: 'the settled amount differs from the ordered price beyond tolerance',
  },
  {
    hold_type: 'quantity_variance',
    owner_role: 'requisitioner',
    resolution_path: 'internal_correction',
    because: 'the received quantity differs from the invoiced quantity beyond tolerance',
  },
  {
    hold_type: 'cardinality_residual',
    owner_role: 'treasury',
    resolution_path: 're_application',
    because: 'the settled set leaves an unexplained residual on the document',
  },
  {
    hold_type: 'no_reference',
    owner_role: 'vendor',
    resolution_path: 'customer_outreach',
    because: 'the bank narration carries no reference token to settle against',
  },
  {
    hold_type: 'matching',
    owner_role: 'ap_clerk',
    resolution_path: 're_application',
    because: 'no candidate cleared the scorer on its own merits',
  },
];

const RULE_BY_TYPE = new Map<HoldType, RoutingRule>(
  ROUTING_RULES.map((rule) => [rule.hold_type, rule]),
);

const PRECEDENCE = new Map<HoldType, number>(
  ROUTING_RULES.map((rule, index) => [rule.hold_type, index]),
);

export interface RoutingSuggestion {
  readonly owner_role: OwnerRole;
  readonly resolution_path: ResolutionPath;
  readonly decided_by_hold_type: HoldType;
  readonly because: string;
  readonly is_suggestion: true;
  readonly note: string;
}

const SUGGESTION_NOTE =
  'Derived from hold policy, not from a model. The reviewer chooses; the choice is what gets recorded.';

export function suggestRouting(holdTypes: readonly HoldType[]): RoutingSuggestion | null {
  let best: RoutingRule | null = null;
  let bestRank = Number.MAX_SAFE_INTEGER;
  for (const type of holdTypes) {
    const rank = PRECEDENCE.get(type);
    const rule = RULE_BY_TYPE.get(type);
    if (rule === undefined || rank === undefined) continue;
    if (rank < bestRank) {
      bestRank = rank;
      best = rule;
    }
  }
  if (best === null) return null;
  return {
    owner_role: best.owner_role,
    resolution_path: best.resolution_path,
    decided_by_hold_type: best.hold_type,
    because: best.because,
    is_suggestion: true,
    note: SUGGESTION_NOTE,
  };
}

/**
 * Which hold types a tolerance of a given kind can govern.
 *
 * A tolerance change may only ever touch holds this table admits. It is read from the
 * TABLES — the hold rows in scope — and never by asking the engine to re-run, which is
 * what keeps the API independent of engine work and keeps the released set auditable.
 */
/**
 * Derived from `engine/rules`, which is the single source.
 *
 * This table was originally the API's own, written before `engine/rules` existed. W10
 * built the engine-side rules from a stricter definition — a tolerance kind reaches a hold
 * type iff the condition raising that hold is actually tested against a `Tolerance` of
 * that kind — and the two disagreed on four rows. The API's version over-claimed:
 *
 *   - `exact` was listed as governing four hold types. An exact tolerance has no number to
 *     move, so a retype releases nothing.
 *   - `days` was listed as governing `period_deferral`, `credit_note_crossing` and
 *     `duplicate_candidate`. Those turn on month EQUALITY, and no window makes March equal
 *     April.
 *   - `duplicate_candidate` was reachable at all. It never consults a tolerance; its
 *     window is frozen policy.
 *
 * That over-claim was visible: the 428 preview would have told a reviewer which holds a
 * tolerance change was about to release, and named holds it could not release. Promising a
 * release that does not happen is the same class of error as releasing one silently.
 */
const KINDS: readonly ToleranceKind[] = [
  'exact',
  'absolute_paise',
  'percentage',
  'days',
  'similarity',
];

export const TOLERANCE_GOVERNS: Readonly<Record<ToleranceKind, readonly HoldType[]>> =
  Object.freeze(
    Object.fromEntries(
      KINDS.map((kind) => [kind, governedHoldTypes(kind)]),
    ) as Record<ToleranceKind, readonly HoldType[]>,
  );
