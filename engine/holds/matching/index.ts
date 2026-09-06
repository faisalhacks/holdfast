// W05d — engine/holds/matching. Public surface.
//
// ─── What this family is ─────────────────────────────────────────────────────────────
//
// The two hold codes nobody else owns: `matching` and `no_reference`. Between them they
// cover the invoice that no payment settles, which is the largest single population in any
// real AP ledger and the one an automation is most tempted to leave as a blank row. A blank
// row says nothing, routes nowhere and cannot be counted; a typed hold says which of the
// two conditions holds, carries the evidence for it, and lifts itself when the condition
// resolves.
//
// ─── Wiring ──────────────────────────────────────────────────────────────────────────
//
//     import { matchingFamily } from './matching';   // engine/holds/registry.ts
//
// The registry is frozen and orchestrator-owned; this directory exports and does not
// register. `matchingFamily.handles` is `['matching', 'no_reference']` and nothing else.
//
// ─── The three moving parts ──────────────────────────────────────────────────────────
//
//   reference.ts  did a reference token survive onto the bank line at all — recovered from
//                 `narration_raw` by engine/normalise, never read from an extracted column
//   assess.ts     the decision procedure: the specific claim (`no_reference`) is tested
//                 first and needs positive money evidence; `matching` is what is left
//   conflicts.ts  fixed clauses; every proposal carries at least one Conflict, because
//                 `applyAll()` throws on an empty array and it is right to
//
// ─── Why both codes auto-release ─────────────────────────────────────────────────────
//
// `HOLD_POLICY` declares both `auto_releasable: true, blocks_accounting: false`, and the
// registry owns that decision rather than this worker — the family that raises a hold is
// the last one that should get to say it may be lifted without a human. It is also right
// on the domain. An unpaid invoice is not exception work: nobody has erred, the money has
// not arrived, and the only correct action is to wait. Sending it to a named person fills
// the queue with rows that cannot be actioned, which is the alert fatigue that stops
// anybody reading the queue at all. Accrual entries may still be raised meanwhile, which is
// Oracle's distinction and the reason this reads as an AP system rather than a match flag.
//
// The invoice still cannot be PAID while either hold is on. When a payment arrives it goes
// back through the same deterministic scorer as everything else, and the amount cap applies
// there, so nothing here is a route to clearing a high-value invoice on a score. Where the
// invoice sits above that cap the fact is carried as an explicit `amount_over_cap` conflict
// and lifts the hold to the head of the queue.
//
// ─── What it will not do ─────────────────────────────────────────────────────────────
//
// It does not speak over another family. `matching` on a row already held as a
// `duplicate_candidate` is true and useless, and two sentences where one was needed is how
// a queue stops being read. It stands down instead — see family.ts.
//
// It does not raise `no_reference` merely because a narration looked thin. That code is a
// claim that the money reconciles and the document number is missing or unusable, and
// without the money evidence it is the other code. Preferring the vaguer of two hold types
// is how a per-type recall figure becomes meaningless.
//
// And it does not take a row from a sibling by declaring a severity its evidence does not
// support. `principal()` in engine/run.ts ranks by severity first, so a family can buy the
// headline on any row it likes for the price of one inflated word. That is the same move as
// a widened tolerance and it is refused for the same reason — see family.ts.

export { recoverReference, noneCarryReference } from './reference';
export type { ReferenceRecovery } from './reference';

export { ACCEPT_MIN, assess, bestComposite, nothingClears, reconcilingCandidates } from './assess';
export type { MatchingCause, MatchingFinding } from './assess';

export {
  MATCHING_CLAUSES,
  MATCHING_FIELD_PATHS,
  capConflict,
  distinctConflicts,
  evidenceConflicts,
  matchingConflict,
  noReferenceConflict,
  severityOf,
} from './conflicts';

export { MATCHING_FAMILY_ID, anotherFamilySpeaks, matchingFamily, proposalFor } from './family';
