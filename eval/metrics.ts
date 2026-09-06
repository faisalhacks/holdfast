// W03 — eval harness. THE DEFINITIONS. Implemented exactly, and nowhere else.
//
//   Correct auto-clear   the cleared payment set EXACTLY EQUALS the truth set.
//                        Set equality, not overlap. Eleven of twelve payments is wrong.
//
//   False clear          an auto-clear whose set differs from truth, OR where truth says
//                        no match exists. ABSOLUTE COUNT, never a rate. At 200 rows a rate
//                        rounds to nothing and hides the one number we exist to publish.
//                        The rate is carried too, because the regression gate compares it,
//                        but the count is the headline.
//
//   Rupees at risk       the sum of invoice amounts on false clears, in paise, reported
//                        beside the count. A judge feels rupees; they read percentages.
//
//   Per-hold-type recall correctly held AND correctly typed, over all of that type in
//                        truth. Per type. Aggregate-only reporting is exactly what we
//                        criticise the category for and we do not get to do it ourselves.
//
//   Coverage             the share decided without a human — every row whose outcome the
//                        system itself declares needs no named person. An auto-releasing
//                        hold counts; a hold requiring a named release does not. Reported
//                        against the ~70% industry plateau.

import { HOLD_TYPES, STRATA } from '../lib/types';
import type {
  EvalTotals,
  HoldType,
  HoldTypeFigures,
  Paise,
  PerHoldTypeMap,
  Ratio,
  StratificationMap,
  Stratum,
  StratumFigures,
} from '../lib/types';
import type { DatasetBundle } from './dataset';
import type { SystemOutcome } from './schema';

const paise = (n: number): Paise => n as unknown as Paise;
const ratio = (numerator: number, denominator: number): Ratio =>
  denominator > 0 ? numerator / denominator : 0;

/** Set equality over payment ids. Order-free, duplicate-free, both directions. */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const v of left) if (!right.has(v)) return false;
  return true;
}

export interface ScoredRow {
  readonly invoice_id: string;
  readonly stratum: Stratum;
  readonly amount_paise: number;
  readonly decided: boolean;
  readonly auto_cleared: boolean;
  readonly held: boolean;
  readonly correct_auto_clear: boolean;
  readonly false_clear: boolean;
  readonly conflicts: number;
  readonly hold_type: HoldType | null;
  readonly expected_hold_type: HoldType | null;
  readonly requires_human: boolean;
}

export interface Scored {
  readonly totals: EvalTotals;
  readonly stratification: StratificationMap;
  readonly per_hold_type: PerHoldTypeMap;
  readonly rows: readonly ScoredRow[];
  readonly notes: readonly string[];
}

const emptyOutcome = (invoiceId: string): SystemOutcome => ({
  invoice_id: invoiceId as unknown as SystemOutcome['invoice_id'],
  action: 'unmatched',
  payment_ids: [],
  hold_type: null,
  requires_human: true,
  conflicts: [],
});

/**
 * Score one system against one dataset.
 *
 * Every invoice in the ledger is scored. A system that returns no decision for an invoice
 * is treated as having left it to a human — silence is not coverage.
 */
export function score(bundle: DatasetBundle, outcomes: readonly SystemOutcome[]): Scored {
  const notes: string[] = [];
  const truthById = new Map(bundle.truth.map((t) => [String(t.invoice_id), t]));
  const outcomeById = new Map(outcomes.map((o) => [String(o.invoice_id), o]));

  const rows: ScoredRow[] = [];
  let missingOutcomes = 0;
  let unscorable = 0;

  for (const invoice of bundle.invoices) {
    const id = String(invoice.id);
    const truth = truthById.get(id);
    const outcome = outcomeById.get(id);
    if (!outcome) missingOutcomes += 1;
    const decision = outcome ?? emptyOutcome(id);

    const autoCleared = decision.action === 'auto_clear';
    const held = decision.action === 'hold';
    const decided = decision.requires_human === false;

    let correct = false;
    let falseClear = false;
    if (autoCleared) {
      if (!truth) {
        // No answer key for this row. It cannot be called correct, and calling it a false
        // clear would invent an error. It is counted and stated instead.
        unscorable += 1;
      } else if (truth.payment_ids === null) {
        // Truth says NO match exists. Clearing it is a false clear by definition.
        falseClear = true;
      } else if (sameSet(decision.payment_ids.map(String), truth.payment_ids.map(String))) {
        correct = true;
      } else {
        falseClear = true;
      }
    }

    rows.push({
      invoice_id: id,
      stratum: truth?.stratum ?? 'clean',
      amount_paise: invoice.gross_paise as unknown as number,
      decided,
      auto_cleared: autoCleared,
      held,
      correct_auto_clear: correct,
      false_clear: falseClear,
      conflicts: decision.conflicts.length,
      hold_type: held ? decision.hold_type : null,
      expected_hold_type: truth?.expected_hold_type ?? null,
      requires_human: decision.requires_human,
    });
  }

  if (missingOutcomes > 0) {
    notes.push(`${missingOutcomes} invoice(s) received no decision and were counted as left to a human`);
  }
  if (unscorable > 0) {
    notes.push(`${unscorable} auto-clear(s) had no truth row and could be scored neither correct nor false`);
  }

  const invoicesTotal = bundle.invoices.length;
  const decidedCount = rows.filter((r) => r.decided).length;
  const autoClearedCount = rows.filter((r) => r.auto_cleared).length;
  const heldCount = rows.filter((r) => r.held).length;
  const humanRequiredCount = rows.filter((r) => r.requires_human).length;
  const unmatchedCount = rows.filter((r) => !r.auto_cleared && !r.held).length;
  const correctAutoClears = rows.filter((r) => r.correct_auto_clear).length;
  const falseClears = rows.filter((r) => r.false_clear).length;
  const rupeesAtRisk = rows.filter((r) => r.false_clear).reduce((sum, r) => sum + r.amount_paise, 0);
  const conflictsEmitted = rows.reduce((sum, r) => sum + r.conflicts, 0);
  const heldWithoutConflict = rows.filter((r) => r.held && r.conflicts === 0).length;
  const matchable = bundle.truth.filter((t) => t.payment_ids !== null).length;

  const holdsByType = {} as Record<HoldType, number>;
  for (const t of HOLD_TYPES) holdsByType[t] = 0;
  for (const r of rows) if (r.held && r.hold_type !== null) holdsByType[r.hold_type] += 1;

  const totals: EvalTotals = {
    invoices_total: invoicesTotal,
    payments_total: bundle.payments.length,
    decided_count: decidedCount,
    coverage: ratio(decidedCount, invoicesTotal),
    auto_cleared_count: autoClearedCount,
    held_count: heldCount,
    human_required_count: humanRequiredCount,
    unmatched_count: unmatchedCount,
    holds_by_type: holdsByType,
    conflicts_emitted: conflictsEmitted,
    held_invoices_without_conflict: heldWithoutConflict,
    amount_invoiced_paise: paise(bundle.invoices.reduce((s, i) => s + (i.gross_paise as unknown as number), 0)),
    amount_auto_cleared_paise: paise(rows.filter((r) => r.auto_cleared).reduce((s, r) => s + r.amount_paise, 0)),
    amount_held_paise: paise(rows.filter((r) => r.held).reduce((s, r) => s + r.amount_paise, 0)),
    correct_auto_clears: correctAutoClears,
    false_clears: falseClears,
    false_clear_rate: ratio(falseClears, decidedCount),
    rupees_at_risk_paise: paise(rupeesAtRisk),
    // Precision over what the system chose to clear. A system that clears nothing gets 0,
    // not a free 1.0 — abstention is not accuracy, and the floor must not reward it.
    match_precision: ratio(correctAutoClears, autoClearedCount),
    match_recall: ratio(correctAutoClears, matchable),
    conflicts_per_held_invoice: ratio(conflictsEmitted, heldCount),
  };

  // ── stratification: always disclosed, declared beside realised ──────────────
  const stratification = {} as Record<Stratum, StratumFigures>;
  for (const s of STRATA) {
    const inStratum = rows.filter((r) => r.stratum === s);
    const declared = bundle.declaredMix ? bundle.declaredMix[s] : inStratum.length;
    const decidedHere = inStratum.filter((r) => r.decided).length;
    stratification[s] = {
      declared_count: declared,
      realised_count: inStratum.length,
      decided_count: decidedHere,
      coverage: ratio(decidedHere, inStratum.length),
      false_clears: inStratum.filter((r) => r.false_clear).length,
      rupees_at_risk_paise: paise(
        inStratum.filter((r) => r.false_clear).reduce((sum, r) => sum + r.amount_paise, 0)
      ),
    };
  }

  // ── per hold type: recall over truth, precision over what was applied ───────
  const perHoldType = {} as Record<HoldType, HoldTypeFigures>;
  for (const t of HOLD_TYPES) {
    const expected = rows.filter((r) => r.expected_hold_type === t).length;
    const applied = rows.filter((r) => r.held && r.hold_type === t).length;
    const correct = rows.filter((r) => r.held && r.hold_type === t && r.expected_hold_type === t).length;
    // `auto_released` is the hold that lifts itself once the condition resolves;
    // `human_released` is the hold that needs a named person with a reason. The split is
    // the domain model's, and it is what coverage is computed from.
    const autoReleased = rows.filter((r) => r.held && r.hold_type === t && !r.requires_human).length;
    perHoldType[t] = {
      expected_count: expected,
      applied_count: applied,
      correct_count: correct,
      recall: ratio(correct, expected),
      precision: ratio(correct, applied),
      auto_released_count: autoReleased,
      human_released_count: applied - autoReleased,
    };
  }

  return { totals, stratification, per_hold_type: perHoldType, rows, notes };
}
