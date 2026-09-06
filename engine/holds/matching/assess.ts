// W05d — engine/holds/matching. The assessment.
//
// Two codes, one invoice, and one decision procedure that separates them on evidence.
//
//   no_reference  A bank line RECONCILES this invoice on money — its settled sum sits
//                 inside the tolerance the scorer itself declared and reported on the
//                 evidence row — and no line that reconciles it carries a USABLE reference
//                 for this document. Either no reference token survived onto the narration
//                 at all, or the tokens that did survive name something else. The money is
//                 there and the document number is not. That is a statement about the FEED,
//                 and it resolves when a reference is recovered, which is why the registry
//                 lets it release itself.
//
//   matching      Nothing settles this invoice. Either no candidate reconciles it on money
//                 at all, or one does and names it correctly and the pairing still fell
//                 short of the acceptance bar. The invoice is unpaid; when the money
//                 arrives the condition resolves by itself.
//
// USABLE IS THE WORD THAT DOES THE WORK, and it is the registry's own: "No usable reference
// token was found on the payment side." A token is usable for this invoice when it was
// recoverable from `narration_raw` AND the scorer judged it to correspond at or above the
// reference floor declared in engine/match/spec.ts. Absent and unrecognisable are the same
// finding from a reviewer's chair — neither tells anybody which document was paid — and the
// two are separated only in the CAUSE, which is where the difference is actionable.
//
// The order is not arbitrary. `no_reference` is the SPECIFIC claim: it needs positive money
// evidence and a proven absence, so it is tested first and `matching` is what is left.
// Testing them the other way round would let every reference-stripped line fall into
// `matching`, and the more specific code would never be raised at all.
//
// WHAT THIS FILE WILL NOT CLAIM. It never invents money evidence: `within_tolerance` on the
// candidate's own `AmountEvidence` is the scorer's verdict, measured against the band the
// scorer declared, so this family reports the same bound the scorer used rather than
// re-deriving one that drifts. And it never calls a reference absent from a null column —
// see reference.ts.

import type {
  Invoice,
  MatchCandidate,
  Paise,
  Payment,
  PaymentId,
  Ratio,
} from '@/lib/types';
import type { HoldContext } from '@/engine/holds/registry';
import { MATCH_SPEC_V1 } from '@/engine/match';
import { recoverReference, type ReferenceRecovery } from './reference';

/** Which of the conditions fired. The first two are `no_reference`; the rest are `matching`. */
export type MatchingCause =
  /** A line reconciles the money and no reference token was recoverable from it. */
  | 'settling_line_carries_no_reference'
  /** A line reconciles the money and the tokens on it name some other document. */
  | 'settling_line_names_another_document'
  /** Candidates were retained; not one of them settles the invoice within tolerance. */
  | 'nothing_reconciles_the_money'
  /** A line reconciles the money and names the document, and the pairing still fell short. */
  | 'nothing_reached_the_bar'
  /** Nothing scored high enough to be retained as a candidate at all. */
  | 'no_candidate_retained';

export interface MatchingFinding {
  readonly type: 'matching' | 'no_reference';
  readonly cause: MatchingCause;
  /** The candidate the finding is about. Null when none was retained. */
  readonly candidate: MatchCandidate | null;
  /** The bank lines that candidate names, with what each narration yielded. */
  readonly recoveries: readonly ReferenceRecovery[];
  /** The best composite on offer, so the reason line states how far short it fell. */
  readonly best_composite: Ratio | null;
  /** Invoice gross minus the cited candidate's settled sum. Zero when it reconciles. */
  readonly residual_paise: Paise;
  readonly above_cap: boolean;
}

/**
 * The acceptance bar. `engine/run.ts` clears an invoice when its top candidate reaches
 * `MATCH_SPEC_V1.ranking.accept_min` and this family reads the SAME constant, so the two
 * cannot drift into a gap where a row is neither cleared nor held, or an overlap where a
 * row is both. The bar is declared data in engine/match/spec.ts; nothing here re-picks it.
 */
export const ACCEPT_MIN: Ratio = MATCH_SPEC_V1.ranking.accept_min;

function paymentIndex(payments: readonly Payment[]): ReadonlyMap<string, Payment> {
  const index = new Map<string, Payment>();
  for (const payment of payments) index.set(String(payment.id), payment);
  return index;
}

function recoveriesFor(
  ids: readonly PaymentId[],
  index: ReadonlyMap<string, Payment>,
): readonly ReferenceRecovery[] {
  const out: ReferenceRecovery[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    const payment = index.get(key);
    if (payment === undefined) continue;
    out.push(recoverReference(payment));
  }
  return out;
}

/** The best composite among the retained candidates, or null when there are none. */
export function bestComposite(candidates: readonly MatchCandidate[]): Ratio | null {
  let best: Ratio | null = null;
  for (const candidate of candidates) {
    const composite = candidate.score.composite;
    if (best === null || composite > best) best = composite;
  }
  return best;
}

/** True when no retained candidate reaches the bar `engine/run.ts` clears on. */
export function nothingClears(candidates: readonly MatchCandidate[]): boolean {
  const best = bestComposite(candidates);
  return best === null || best < ACCEPT_MIN;
}

/** Candidates whose settled sum reconciles the invoice inside the scorer's own tolerance. */
export function reconcilingCandidates(
  candidates: readonly MatchCandidate[],
): readonly MatchCandidate[] {
  return candidates.filter((c) => c.evidence.amount.within_tolerance);
}

/**
 * Does this candidate name the document usably?
 *
 * Two conditions, and both are somebody else's verdict rather than this family's opinion.
 * `engine/normalise` says whether a reference token was recoverable from `narration_raw` at
 * all, and the scorer's `ReferenceEvidence.within_tolerance` says whether the token it
 * chose corresponds at or above the declared floor. The first implies the second under the
 * default profiles — a line with no recoverable token offers the scorer nothing to compare
 * — so the recovery test is belt and braces. It is written down anyway, because the whole
 * claim of this code is about what the narration carried, and a claim that rests on an
 * implication two modules away is one nobody will re-check when a profile changes.
 */
function namesTheDocument(
  candidate: MatchCandidate,
  index: ReadonlyMap<string, Payment>,
): boolean {
  if (!candidate.evidence.reference.within_tolerance) return false;
  return recoveriesFor(candidate.payment_ids, index).some((r) => r.recovered);
}

/**
 * What this family has to say about one invoice, or null when it has nothing.
 *
 * Silence is the answer whenever a candidate already clears the bar: that invoice is the
 * matcher's business, and a hold saying "nothing settles this" over the top of a payment
 * that did settle it would be false on its face.
 */
export function assess(ctx: HoldContext, invoice: Invoice): MatchingFinding | null {
  const candidates = ctx.candidates;
  if (!nothingClears(candidates)) return null;

  const aboveCap = Math.abs(invoice.gross_paise) > ctx.policy.amount_cap_paise;
  const index = paymentIndex(ctx.payments);
  const best = bestComposite(candidates);
  const reconciling = reconcilingCandidates(candidates);

  if (reconciling.length > 0) {
    const naming = reconciling.find((c) => namesTheDocument(c, index));
    if (naming === undefined) {
      // Ranked input, so the first reconciling candidate is the strongest one and is the
      // one cited. The cause separates "nothing was written down" from "something was
      // written down and it is not this invoice"; they route to different fixes.
      const cited = reconciling[0]!;
      const recoveries = recoveriesFor(cited.payment_ids, index);
      const carriedSomething = recoveries.some((r) => r.recovered);
      return {
        type: 'no_reference',
        cause: carriedSomething
          ? 'settling_line_names_another_document'
          : 'settling_line_carries_no_reference',
        candidate: cited,
        recoveries,
        best_composite: best,
        residual_paise: cited.residual_paise,
        above_cap: aboveCap,
      };
    }

    return {
      type: 'matching',
      cause: 'nothing_reached_the_bar',
      candidate: naming,
      recoveries: recoveriesFor(naming.payment_ids, index),
      best_composite: best,
      residual_paise: naming.residual_paise,
      above_cap: aboveCap,
    };
  }

  const top = candidates[0] ?? null;
  return {
    type: 'matching',
    cause: top === null ? 'no_candidate_retained' : 'nothing_reconciles_the_money',
    candidate: top,
    recoveries: top === null ? [] : recoveriesFor(top.payment_ids, index),
    best_composite: best,
    residual_paise: top === null ? invoice.gross_paise : top.residual_paise,
    above_cap: aboveCap,
  };
}
