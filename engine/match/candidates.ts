// W04b — candidate generation.
//
// NAIVE FULL CROSS-PRODUCT, ON PURPOSE. Every invoice is compared against every payment.
// Two hundred invoices and a hundred and seventy-three payments is thirty-four thousand six
// hundred comparisons and it costs a rounding error of wall time. There is no blocking here
// — no vendor bucket, no amount bucket, no date bucket, no candidate pre-filter of any kind.
// Blocking is an optimisation for a problem this size does not have, and every blocking
// scheme silently deletes the pairs it was wrong about, which means the bug it introduces is
// invisible in exactly the rows you would need to see it in.
//
// `comparisons` is reported on the result so the claim is checkable rather than asserted: it
// equals invoices x payments, every time. A number below that is a bug, or somebody's
// blocking scheme.
//
// WHAT IS TRUNCATED, AND WHAT IS NOT. The COMPARISON is exhaustive. The RETAINED LIST is
// bounded by `ranking.consider_min` and `ranking.max_candidates_per_invoice`, both declared
// in the spec. That is a reporting bound, not a search bound: every pair was scored, and the
// bound only decides how many of the losers are carried forward into the queue.

import type {
  Conflict,
  InvoiceId,
  MatchCandidate,
  MatchCandidateId,
  PaymentId,
  ProposalSource,
} from '@/lib/types';
import { noCandidateConflict, tiedCandidatesConflict } from './conflicts';
import { pairingKey, scorePairing } from './score';
import type { MatchSpec, TieBreakKey } from './spec';
import type {
  CandidateProposal,
  InvoiceCandidates,
  MatchContext,
  MatchResult,
  PreparedInvoice,
  PreparedLedger,
  PreparedPayment,
  ScoredPairing,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Ordering
// ─────────────────────────────────────────────────────────────────────────────

function dateProximity(pairing: ScoredPairing): number {
  if (pairing.evidence.date.payment_value === null) return Number.POSITIVE_INFINITY;
  return Math.abs(pairing.evidence.date.delta);
}

function idsKey(pairing: ScoredPairing): string {
  return [...pairing.payment_ids].sort().join('+');
}

function compareOn(key: TieBreakKey, a: ScoredPairing, b: ScoredPairing): number {
  switch (key) {
    case 'composite':
      return b.score.composite - a.score.composite;
    case 'reference':
      return b.score.reference.score - a.score.reference.score;
    case 'amount':
      return b.score.amount.score - a.score.amount.score;
    case 'vendor':
      return b.score.vendor.score - a.score.vendor.score;
    case 'date_proximity':
      return dateProximity(a) - dateProximity(b);
    case 'payment_ids': {
      const ka = idsKey(a);
      const kb = idsKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    }
    default:
      return 0;
  }
}

/**
 * A TOTAL order, by declaration.
 *
 * The last key is the payment id set, which is unique per invoice, so no two candidates ever
 * compare equal. Without that the order of equal candidates would fall back to the order the
 * ledger happened to be read in — two runs over the same frozen bytes could rank them
 * differently, and neither run would record why. `validateSpec` refuses a tie-break list that
 * omits it.
 */
export function rankPairings(
  pairings: readonly ScoredPairing[],
  tieBreak: readonly TieBreakKey[],
): readonly ScoredPairing[] {
  return [...pairings].sort((a, b) => {
    for (const key of tieBreak) {
      const d = compareOn(key, a, b);
      if (d !== 0) return d;
    }
    return 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract objects
// ─────────────────────────────────────────────────────────────────────────────

function candidateId(runId: string, pairing: ScoredPairing): MatchCandidateId {
  return `MC:${runId}:${pairingKey(pairing.invoice_id, pairing.payment_ids)}` as MatchCandidateId;
}

/**
 * `reverified` is TRUE on everything this module emits, and that is a statement of fact
 * rather than a default: the value left this file having gone through `scorePairing`, which
 * is the only place a composite is produced. A `model_proposal` that has not been through
 * that function never becomes a `MatchCandidate` at all — there is no code path here that
 * accepts a score from outside.
 */
function toCandidate(
  pairing: ScoredPairing,
  ctx: MatchContext,
  rank: number,
  proposedBy: ProposalSource,
  extraConflicts: readonly Conflict[],
): MatchCandidate {
  return {
    id: candidateId(ctx.run_id, pairing),
    run_id: ctx.run_id,
    invoice_id: pairing.invoice_id,
    payment_ids: pairing.payment_ids,
    cardinality: pairing.cardinality,
    score: pairing.score,
    evidence: pairing.evidence,
    conflicts: extraConflicts.length === 0
      ? pairing.conflicts
      : [...pairing.conflicts, ...extraConflicts],
    residual_paise: pairing.residual_paise,
    proposed_by: proposedBy,
    reverified: true,
    rank,
    created_at: ctx.now,
  };
}

function sourceOf(pairing: ScoredPairing): ProposalSource {
  return pairing.exact ? 'deterministic_exact' : 'deterministic_fuzzy';
}

// ─────────────────────────────────────────────────────────────────────────────
// One invoice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores this invoice against EVERY payment in the ledger, then retains the declared number
 * of best candidates.
 *
 * The tie window is applied after ranking and before truncation, so a genuine SAP F.13 tie —
 * gross agreeing to the paise with only the date separating the rows — is reported as
 * `multiple_candidates_tied` on every candidate inside the window, rather than resolved by
 * whichever row the sort happened to put first.
 */
export function generateForInvoice(
  ledger: PreparedLedger,
  invoice: PreparedInvoice,
  ctx: MatchContext,
): InvoiceCandidates {
  const { ranking } = ctx.spec;
  const scored: ScoredPairing[] = [];

  for (const payment of ledger.payments) {
    scored.push(scorePairing(invoice, [payment], ctx));
  }

  const retained = rankPairings(
    scored.filter((p) => p.score.composite >= ranking.consider_min),
    ranking.tie_break,
  ).slice(0, ranking.max_candidates_per_invoice);

  const conflicts: Conflict[] = [];
  if (retained.length === 0) conflicts.push(noCandidateConflict(ctx));

  const top = retained[0];
  const tiedCount =
    top === undefined
      ? 0
      : retained.filter((p) => top.score.composite - p.score.composite <= ranking.tie_epsilon)
          .length;
  const tie = tiedCount >= 2 ? tiedCandidatesConflict(ctx) : null;
  if (tie !== null) conflicts.push(tie);

  const candidates = retained.map((pairing, index) => {
    const inTie =
      tie !== null &&
      top !== undefined &&
      top.score.composite - pairing.score.composite <= ranking.tie_epsilon;
    return toCandidate(pairing, ctx, index + 1, sourceOf(pairing), inTie ? [tie] : []);
  });

  return {
    invoice_id: invoice.invoice_id,
    candidates,
    conflicts,
    comparisons: ledger.payments.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The ledger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every invoice against every payment. The weights and the spec id travel out on the result
 * as well as on every individual score, so a report can name the strategy that produced it
 * without reaching back into this module.
 */
export function matchLedger(ledger: PreparedLedger, ctx: MatchContext): MatchResult {
  const byInvoice = ledger.invoices.map((invoice) => generateForInvoice(ledger, invoice, ctx));
  let comparisons = 0;
  for (const row of byInvoice) comparisons += row.comparisons;

  return {
    run_id: ctx.run_id,
    scorer_version: ctx.spec.id,
    weights: ctx.spec.weights,
    profile_ids: ledger.profile_ids,
    by_invoice: byInvoice,
    comparisons,
  };
}

/**
 * Payments that more than one ELIGIBLE invoice lays claim to.
 *
 * A payment settles once. When two invoices both rank it first AND both clear
 * `ranking.accept_min`, either one of them is wrong or the two invoices are the same
 * document booked twice — and on an adversarial ledger it is usually the second, because a
 * duplicate invoice carries the same reference and the same amount and therefore scores
 * identically against the same bank line.
 *
 * The eligibility bar is what makes this worth reading. Without it every invoice with no
 * real match still nominates its least-bad payment, and half the ledger looks contested.
 *
 * THIS IS NOT DUPLICATE DETECTION. Duplicate detection runs over INVOICES, before matching,
 * and it belongs to W05a; doing it here would be the standard mistake of modelling an
 * overpayment control as a match failure. What this reports is a fact about the RANKING —
 * one payment, two claimants — which a hold family would otherwise have to rediscover by
 * walking the whole result itself.
 */
export function contestedPayments(
  result: MatchResult,
  spec: MatchSpec,
): ReadonlyMap<PaymentId, readonly InvoiceId[]> {
  const claims = new Map<PaymentId, InvoiceId[]>();
  for (const row of result.by_invoice) {
    const top = row.candidates[0];
    if (top === undefined) continue;
    if (top.score.composite < spec.ranking.accept_min) continue;
    for (const id of top.payment_ids) {
      const at = claims.get(id);
      if (at === undefined) claims.set(id, [row.invoice_id]);
      else at.push(row.invoice_id);
    }
  }
  const out = new Map<PaymentId, readonly InvoiceId[]>();
  for (const [id, invoices] of claims) if (invoices.length > 1) out.set(id, invoices);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exact pairings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EXACT MATCH ON (REFERENCE, AMOUNT), as its own view.
 *
 * Canonicalised references equal and the settled sum equal to the invoice gross to the
 * paise. Same exhaustive cross-product, same scorer; this simply keeps the pairings that
 * cleared the exact predicate, so the claim can be checked on its own without reading a
 * composite or trusting a weighting.
 */
export function exactPairings(
  ledger: PreparedLedger,
  ctx: MatchContext,
): readonly ScoredPairing[] {
  const out: ScoredPairing[] = [];
  for (const invoice of ledger.invoices) {
    for (const payment of ledger.payments) {
      const pairing = scorePairing(invoice, [payment], ctx);
      if (pairing.exact) out.push(pairing);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-verification
// ─────────────────────────────────────────────────────────────────────────────

function invoiceById(ledger: PreparedLedger, id: InvoiceId): PreparedInvoice | null {
  return ledger.invoices_by_id.get(id) ?? null;
}

function paymentById(ledger: PreparedLedger, id: PaymentId): PreparedPayment | null {
  return ledger.payments_by_id.get(id) ?? null;
}

/**
 * THE RULE OF THE HOUSE, as a function.
 *
 * A nomination — from a feedback rule, from a cardinality subset search, or from a generated
 * proposal — arrives carrying ids and a provenance and nothing else. It is scored here by the
 * same four components, against the same declared weights, as a pair the cross-product found
 * on its own. The result keeps `proposed_by` so the origin stays visible in the audit, and
 * `reverified` is true because the deterministic scorer has now looked at it.
 *
 * Returns null when the proposal names a record that is not in this ledger, or names no
 * payment at all. A proposal is discarded, never repaired: quietly dropping the unknown ids
 * and scoring what is left would turn a wrong proposal into a plausible one.
 */
export function reverify(
  proposal: CandidateProposal,
  ledger: PreparedLedger,
  ctx: MatchContext,
): MatchCandidate | null {
  const invoice = invoiceById(ledger, proposal.invoice_id);
  if (invoice === null) return null;
  if (proposal.payment_ids.length === 0) return null;

  const payments: PreparedPayment[] = [];
  for (const id of proposal.payment_ids) {
    const payment = paymentById(ledger, id);
    if (payment === null) return null;
    payments.push(payment);
  }

  const pairing = scorePairing(invoice, payments, ctx, proposal.cardinality);
  return toCandidate(pairing, ctx, 1, proposal.proposed_by, []);
}

/**
 * Re-scores a whole batch and returns them ranked among themselves. The rank is assigned
 * here rather than trusted from the proposer, because a proposer that ranked its own output
 * would be grading its own work.
 */
export function reverifyAll(
  proposals: readonly CandidateProposal[],
  ledger: PreparedLedger,
  ctx: MatchContext,
): readonly MatchCandidate[] {
  const scored: { pairing: ScoredPairing; source: ProposalSource }[] = [];
  for (const proposal of proposals) {
    const invoice = invoiceById(ledger, proposal.invoice_id);
    if (invoice === null || proposal.payment_ids.length === 0) continue;
    const payments: PreparedPayment[] = [];
    let complete = true;
    for (const id of proposal.payment_ids) {
      const payment = paymentById(ledger, id);
      if (payment === null) {
        complete = false;
        break;
      }
      payments.push(payment);
    }
    if (!complete) continue;
    scored.push({
      pairing: scorePairing(invoice, payments, ctx, proposal.cardinality),
      source: proposal.proposed_by,
    });
  }

  const order = rankPairings(
    scored.map((s) => s.pairing),
    ctx.spec.ranking.tie_break,
  );
  const sourceByKey = new Map<string, ProposalSource>();
  for (const s of scored) {
    sourceByKey.set(pairingKey(s.pairing.invoice_id, s.pairing.payment_ids), s.source);
  }

  return order.map((pairing, index) =>
    toCandidate(
      pairing,
      ctx,
      index + 1,
      sourceByKey.get(pairingKey(pairing.invoice_id, pairing.payment_ids)) ?? 'model_proposal',
      [],
    ),
  );
}
