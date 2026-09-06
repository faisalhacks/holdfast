// W09 — THE RE-VERIFY GATE. The point of this worker.
//
// A nomination arrives here with ids and a provenance. It leaves as a `MatchCandidate` that
// `engine/match` produced, or it does not leave at all.
//
// The only thing this file does with a nomination is hand it to `reverify`, which is W04b's
// and read-only to us. That function re-scores the pairing with `scorePairing` — the same
// four components, the same declared weights, the same spec id — as every deterministic
// candidate in the run. There is no path here that accepts a score from outside, because
// there is no score on a nomination to accept.
//
// WHAT "CLEARS ON ITS OWN MERITS" MEANS, EXACTLY. `ctx.spec.ranking.accept_min`. That
// number is DERIVED in W04b's spec, not picked: it is `weights.reference + weights.amount`,
// the score of a pairing whose canonicalised reference is equal on both sides and whose
// settled sum equals the invoice gross to the paise. A nomination that scores below it is
// discarded here, and the bar is read from the spec rather than restated, so a sweep that
// moves the weights moves this gate with them.
//
// WHAT ADMISSION IS NOT. An admitted candidate is ELIGIBLE. It is not settled, it is not
// released and it is not a decision:
//   - `engine/holds` runs after matching and a hold beats a score in both directions. A
//     held invoice cannot be paid however well anything scored.
//   - the database refuses `cleared` on any candidate that is not `reverified`
//     (`match_candidates_unverified_cannot_clear`), and refuses to journal a model actor on
//     anything but a proposal event.
//   - nothing in llm/** imports `engine/holds`, `engine/run`, `engine/rules`, `export/` or a
//     database client, so there is no path from here to a release to begin with. That is
//     not a promise in a comment: `llm/boundary.test.ts` walks the import graph and fails
//     if it ever becomes untrue.
//
// The gate is deliberately blind to provenance. A nomination from the model, a feedback
// rule or a cardinality search is judged identically, because "the LLM proposes,
// deterministic code verifies" is only a real rule if the verifier cannot tell who asked.

import { reverify } from '@/engine/match';
import type { CandidateProposal, MatchContext, PreparedLedger } from '@/engine/match';
import type { InvoiceId, MatchCandidate, PaymentId, Ratio } from '@/lib/types';
import {
  assertModelActorOnlyProposes,
  candidateScored,
  modelActor,
  proposalDiscarded,
  type BoundaryJournalEntry,
  type ModelActor,
} from './journal';

/** Why a nomination did not survive. Every discard is one of these, and every one is recorded. */
export const DISCARD_REASONS = [
  /** No payment ids at all. Not a pairing. */
  'empty_set',
  /** An id that is not in the prepared ledger. `reverify` refuses to score a phantom. */
  'unknown_record',
  /** Defensive: a candidate the scorer did not mark as its own work. */
  'not_reverified',
  /** Scored, and below `ranking.accept_min`. The ordinary case, and the important one. */
  'below_accept_min',
] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

export interface DiscardedProposal {
  readonly invoice_id: InvoiceId;
  readonly payment_ids: readonly PaymentId[];
  readonly reason: DiscardReason;
  /** What it actually scored, when it got far enough to score. Null when it did not. */
  readonly observed_composite: Ratio | null;
  /** The bar it was held to, read from the spec that scored it. */
  readonly required_composite: Ratio;
}

export interface AdmissionResult {
  /**
   * Candidates produced BY `engine/match`, carrying its scorer version, its evidence set and
   * `reverified: true`. Eligible for ranking beside every deterministic candidate. Not
   * settled, not released, not decided.
   */
  readonly admitted: readonly MatchCandidate[];
  readonly discarded: readonly DiscardedProposal[];
  readonly journal: readonly BoundaryJournalEntry[];
  readonly notes: readonly string[];
}

export interface AdmitOptions {
  /** Who nominated. Recorded on the discard rows; a model actor, on a proposal event. */
  readonly actor?: ModelActor;
}

/**
 * ENTRY POINT 2 OF 2. Re-scores every nomination and keeps only what stands.
 *
 * Sync and pure: no clock, no network, no randomness. Given the same ledger, context and
 * nominations it admits the same set every time, which is what makes a residual pass
 * something a reviewer can re-run rather than something they have to trust.
 */
export function admitProposals(
  nominations: readonly CandidateProposal[],
  ledger: PreparedLedger,
  ctx: MatchContext,
  options: AdmitOptions = {},
): AdmissionResult {
  const actor = options.actor ?? modelActor();
  const required: Ratio = ctx.spec.ranking.accept_min;

  const admitted: MatchCandidate[] = [];
  const discarded: DiscardedProposal[] = [];
  const journal: BoundaryJournalEntry[] = [];

  const drop = (
    nomination: CandidateProposal,
    reason: DiscardReason,
    observed: Ratio | null,
  ): void => {
    discarded.push({
      invoice_id: nomination.invoice_id,
      payment_ids: nomination.payment_ids,
      reason,
      observed_composite: observed,
      required_composite: required,
    });
    journal.push(
      proposalDiscarded(actor, nomination.invoice_id, ctx.now, {
        call_site: actor.call_site,
        reason,
        observed_composite: observed,
        required_composite: required,
        payment_count: nomination.payment_ids.length,
      }),
    );
  };

  for (const nomination of nominations) {
    if (nomination.payment_ids.length === 0) {
      drop(nomination, 'empty_set', null);
      continue;
    }

    // THE RE-SCORE. Everything below reads the result; nothing below produces one.
    const candidate = reverify(nomination, ledger, ctx);

    if (candidate === null) {
      drop(nomination, 'unknown_record', null);
      continue;
    }
    if (candidate.reverified !== true) {
      drop(nomination, 'not_reverified', candidate.score.composite);
      continue;
    }
    if (candidate.score.composite < required) {
      drop(nomination, 'below_accept_min', candidate.score.composite);
      continue;
    }

    admitted.push(candidate);
    // Authored by the SYSTEM, not by the model: the deterministic scorer is what looked at
    // this pairing, and recording the model as the author of a score it did not produce is
    // the exact misattribution the journal constraint exists to refuse.
    journal.push(
      candidateScored(candidate.id, ctx.now, {
        proposed_by: candidate.proposed_by,
        reverified: candidate.reverified,
        composite: candidate.score.composite,
        required_composite: required,
        scorer_version: candidate.score.scorer_version,
        conflicts: candidate.conflicts.length,
      }),
    );
  }

  assertModelActorOnlyProposes(journal);

  const notes = [
    `llm/gate: ${admitted.length} of ${nominations.length} nomination(s) re-scored at or above ` +
      `${required} by ${ctx.spec.id}; ${discarded.length} discarded. An admitted candidate is ` +
      'eligible for ranking. It is not settled and it releases nothing — holds are applied after ' +
      'matching and a hold beats a score in both directions.',
  ];

  return { admitted, discarded, journal, notes };
}
