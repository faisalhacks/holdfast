// W05c — the reasoning. What a bounded, anchored subset-sum proves about one invoice.
//
// ─── The question this file answers ──────────────────────────────────────────────────
//
// Not "which payments match this invoice" — that is `engine/match`. The question here is
// narrower and it is the only one a hold family is entitled to ask:
//
//     HOW MUCH OF THIS INVOICE IS PROVABLY SETTLED, AND BY EXACTLY WHICH LINES?
//
// Whatever is left over is the residual, and the residual is the hold.
//
// ─── The tie rule, stated once ───────────────────────────────────────────────────────
//
// A settlement is proven only when the bounded search returns EXACTLY ONE subset. Two
// subsets that both sum to the invoice gross are not a near-miss to be broken by a
// heuristic; they are two different bank transactions, and choosing between them on amount
// alone is the SAP F.13 assignment-field failure — gross agrees to the paise, the reference
// fields disagree, and only the date window separates the candidates. The incumbent takes
// the first row. We refuse to.
//
// So on a tie NOTHING IS PROVABLY APPLIED, and the residual is the whole invoice. That is
// not a rhetorical position: applying a payment to an invoice means naming the payment, and
// if we cannot name it we have not applied it. The hold carries `multiple_candidates_tied`
// beside `residual_unsettled` so the reviewer sees the reason is ambiguity rather than
// absence, and the settling set is reported EMPTY rather than guessed.
//
// The same rule runs in the many-to-one direction, with one carve-out below.
//
// ─── The carve-out: singleton ties are not ours ──────────────────────────────────────
//
// When every tied solution is a single payment, the situation is one invoice with two
// candidate lines of identical value — a suspected duplicate payment, or a plain matching
// ambiguity. Those are `duplicate_candidate` (W05a) and `matching`. Cardinality is about
// the SHAPE of the settlement: several lines to one invoice, or one line to several
// invoices. A family that raises its own hold code on another family's evidence damages
// per-hold-type precision for both, so this family stands down.
//
// ─── The other carve-out: a single short line is a variance, not a cardinality problem ─
//
// One anchored payment that falls short of the invoice by some amount is a bank charge, a
// withholding, an early-payment discount or a rounding difference. That is W05b's lane and
// it has typed holds for it. This family requires structural multiplicity before it speaks:
// at least two lines settling this invoice, or one line settling this invoice among others.
// The test is structural, so it needs no tolerance of its own — and inventing one would be
// exactly the bare number floating in a comparison that the house rules forbid.

import type { CardinalityKind, Invoice, MatchCandidate, Payment, PaymentId } from '@/lib/types';
import { anchoredPools, daysApart, invoicesAnchoredTo, paymentIdsOf } from './anchors';
import { buildBoundedSubsetIndex, verdictFor, type SubsetSolution } from './subset-sum';

export type ResidualCause =
  /** Two or more anchored lines settle this invoice and together fall short. */
  | 'partial_settlement'
  /** One line settles several invoices and this one is not provably covered by it. */
  | 'bulk_partial'
  /** More than one settling set fits. Nothing is provably applied. */
  | 'contested_settlement'
  /** A remittance advice names this invoice from outside the date window. */
  | 'advice_outside_window'
  /** The anchored pool is larger than `max_subset_size`. Not searched, so not proven. */
  | 'pool_exceeds_bound';

export interface ResidualFinding {
  readonly cause: ResidualCause;
  /** Integer paise still unsettled. Equals the gross whenever nothing is proven. */
  readonly residual_paise: number;
  /** Integer paise provably applied. Zero on every contested or unsearched outcome. */
  readonly settled_paise: number;
  /** The proven settling set. EMPTY when the settlement is contested — never a guess. */
  readonly settling_payment_ids: readonly PaymentId[];
  /** The lines that put this invoice in front of a human, proven or not. */
  readonly evidence_payment_ids: readonly PaymentId[];
  readonly cardinality: CardinalityKind;
  readonly contested: boolean;
  /** How far outside the window the nearest advice sat, when that is the cause. */
  readonly days_outside_window: number | null;
  /** Members of the pool that was searched. Reported so the bound is auditable. */
  readonly pool_size: number;
}

export interface CardinalityPolicy {
  readonly date_window_days: number;
  readonly max_subset_size: number;
}

const byId = (a: { readonly id: unknown }, b: { readonly id: unknown }): number =>
  String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;

const paiseOf = (value: unknown): number => value as number;

const everySolutionIsSingleton = (solutions: readonly SubsetSolution[]): boolean =>
  solutions.every((solution) => solution.indices.length === 1);

/**
 * The whole decision, as an ordered sequence of checks. First hit wins, and the order is
 * the point: proven settlement beats contested settlement beats partial settlement beats
 * an out-of-window advice. A later check never overturns an earlier one.
 */
export function findResidual(
  invoice: Invoice,
  payments: readonly Payment[],
  candidates: readonly MatchCandidate[],
  ledger: readonly Invoice[],
  policy: CardinalityPolicy,
): ResidualFinding | null {
  // ── A. Guards ──────────────────────────────────────────────────────────────
  // A credit note is not settled by a subset of debits, and its gross follows the
  // document sign. `credit_note_crossing` is the hold code for it and it is not ours.
  if (invoice.is_credit_note) return null;
  const gross = paiseOf(invoice.gross_paise);
  if (!Number.isFinite(gross) || gross <= 0) return null;

  const windowDays = policy.date_window_days;
  const maxSubsetSize = policy.max_subset_size;
  if (!Number.isFinite(windowDays) || !Number.isFinite(maxSubsetSize) || maxSubsetSize < 1) {
    return null;
  }

  // ── B. Pools ───────────────────────────────────────────────────────────────
  const pools = anchoredPools(invoice, payments, candidates, windowDays, ledger);
  const inWindow = [...pools.inWindow].sort(byId);

  // ── C. Nothing anchored inside the window ──────────────────────────────────
  if (inWindow.length === 0) {
    const advice = [...pools.outOfWindow].sort(byId);
    const first = advice[0];
    if (first === undefined) return null;
    let nearest: number | null = null;
    for (const line of advice) {
      const apart = daysApart(invoice, line);
      if (apart === null) continue;
      if (nearest === null || apart < nearest) nearest = apart;
    }
    return {
      cause: 'advice_outside_window',
      residual_paise: gross,
      settled_paise: 0,
      settling_payment_ids: [],
      evidence_payment_ids: advice.map((line) => line.id),
      cardinality: 'partial',
      contested: false,
      days_outside_window: nearest,
      pool_size: advice.length,
    };
  }

  const amounts = inWindow.map((line) => paiseOf(line.amount_paise));
  const index = buildBoundedSubsetIndex(amounts, maxSubsetSize);

  // ── D. Pool larger than the policy bound. Not searched, therefore not proven. ──
  if (index === null) {
    return {
      cause: 'pool_exceeds_bound',
      residual_paise: gross,
      settled_paise: 0,
      settling_payment_ids: [],
      evidence_payment_ids: inWindow.map((line) => line.id),
      cardinality: 'many_to_many',
      // Not contested: no set was proposed, so no two sets are in dispute. The conflict
      // for this outcome names the bound instead.
      contested: false,
      days_outside_window: null,
      pool_size: inWindow.length,
    };
  }

  // ── E. An exact settlement of the invoice gross ────────────────────────────
  const exact = verdictFor(index, gross);
  if (exact.kind === 'unique') return null; // Settled in full. Nothing to hold.
  if (exact.kind === 'tied') {
    if (everySolutionIsSingleton(exact.solutions)) return null; // W05a / matching, not ours.
    return {
      cause: 'contested_settlement',
      residual_paise: gross,
      settled_paise: 0,
      settling_payment_ids: [],
      evidence_payment_ids: inWindow.map((line) => line.id),
      cardinality: 'many_to_many',
      contested: true,
      days_outside_window: null,
      pool_size: inWindow.length,
    };
  }

  // ── F. No exact settlement: the largest partial settlement that fits ───────
  const best = index.bestSumAtMost(gross);
  if (best > 0) {
    const achieving = index.solutionsFor(best, 2);
    const chosen = achieving[0];
    if (chosen !== undefined && chosen.indices.length >= 2) {
      const contested = achieving.length > 1;
      return {
        cause: 'partial_settlement',
        residual_paise: gross - best,
        settled_paise: contested ? 0 : best,
        settling_payment_ids: contested ? [] : paymentIdsOf(inWindow, chosen.indices),
        evidence_payment_ids: inWindow.map((line) => line.id),
        cardinality: 'one_to_many',
        contested,
        days_outside_window: null,
        pool_size: inWindow.length,
      };
    }
  }

  // ── G. Many-to-one: is this invoice a member of a bulk remittance? ─────────
  return findBulkResidual(invoice, inWindow, ledger, gross, policy);
}

/**
 * One statement line against several invoices. This is the direction `max_subset_size = 40`
 * was written for: a real remittance settles twelve to forty documents, and capping the
 * search at three — as most demonstrations do — is why they look like demonstrations.
 *
 * A line only enters this search when it names at least two documents. One line naming one
 * invoice for more than the invoice is an over-payment, which is a variance question.
 */
function findBulkResidual(
  invoice: Invoice,
  inWindow: readonly Payment[],
  ledger: readonly Invoice[],
  gross: number,
  policy: CardinalityPolicy,
): ResidualFinding | null {
  const invoiceId = String(invoice.id);
  const others = ledger.filter((row) => String(row.id) !== invoiceId);
  let deferred: ResidualFinding | null = null;

  for (const line of inWindow) {
    const siblings = [invoice, ...invoicesAnchoredTo(line, others, policy.date_window_days)].sort(byId);
    if (siblings.length < 2) continue;

    const target = paiseOf(line.amount_paise);
    const ledgerIndex = buildBoundedSubsetIndex(
      siblings.map((row) => paiseOf(row.gross_paise)),
      policy.max_subset_size,
    );
    if (ledgerIndex === null) {
      deferred = deferred ?? {
        cause: 'pool_exceeds_bound',
        residual_paise: gross,
        settled_paise: 0,
        settling_payment_ids: [],
        evidence_payment_ids: [line.id],
        cardinality: 'many_to_one',
        contested: false,
        days_outside_window: null,
        pool_size: siblings.length,
      };
      continue;
    }

    const position = siblings.findIndex((row) => String(row.id) === invoiceId);
    const verdict = verdictFor(ledgerIndex, target);

    if (verdict.kind === 'unique') {
      // Proven: this line settles exactly this set of documents.
      if (verdict.solution.indices.includes(position)) return null; // Ours is one of them.
      continue; // It settles other documents. Silence, not a hold.
    }

    if (verdict.kind === 'tied') {
      // Two identical-value documents against one line is a duplicate question, not a
      // cardinality one. Anything wider is a genuinely contested bulk allocation.
      if (everySolutionIsSingleton(verdict.solutions)) continue;
      deferred = deferred ?? {
        cause: 'contested_settlement',
        residual_paise: gross,
        settled_paise: 0,
        settling_payment_ids: [],
        evidence_payment_ids: [line.id],
        cardinality: 'many_to_one',
        contested: true,
        days_outside_window: null,
        pool_size: siblings.length,
      };
      continue;
    }

    // No subset of the documents this line names adds up to it. The advice is incomplete —
    // a truncated narration listing seven of twenty-two references produces exactly this —
    // so this invoice is named by a bulk line that we cannot reconcile, and it is held.
    deferred = deferred ?? {
      cause: 'bulk_partial',
      residual_paise: gross,
      settled_paise: 0,
      settling_payment_ids: [],
      evidence_payment_ids: [line.id],
      cardinality: 'many_to_one',
      contested: false,
      days_outside_window: null,
      pool_size: siblings.length,
    };
  }

  return deferred;
}
