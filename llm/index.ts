// W09 — THE LLM BOUNDARY. Public surface.
//
// ─── THE RULE OF THE HOUSE ───────────────────────────────────────────────────────────
//
// The LLM proposes. Deterministic code verifies. No output of a model sets a hold release
// or a cleared state, directly or transitively. Every proposal re-enters the same
// deterministic scorer as any other candidate and is discarded if it does not stand on its
// own merits.
//
// ─── TWO ENTRY POINTS, IN THIS ORDER ─────────────────────────────────────────────────
//
//   proposeResiduals(unresolved, statement, options)   async. Asks. Returns NOMINATIONS.
//   admitProposals(nominations, ledger, ctx, options)  sync.  Re-scores. Returns CANDIDATES.
//
// The split is the mechanism, not a style. `propose.ts` imports nothing from `engine/` but a
// type: it cannot score, and it holds no reference to `reverify`, so a nomination has no way
// to reach a candidate except by being handed to the gate. `gate.ts` never looks at where a
// nomination came from, so a model proposal is judged on exactly the terms a deterministic
// one is.
//
// ─── ONE CALL SITE ───────────────────────────────────────────────────────────────────
//
// `LlmCallSite` in the frozen contract names two: `ingestion_normalisation` and
// `residual_proposal`. Amendment 01 CUT the first. Only the second is built here, and there
// is no author anywhere in this repository for the other one.
//
// ─── WHAT THIS MODULE CANNOT DO ──────────────────────────────────────────────────────
//
// It applies no hold, lifts no hold, records no decision, changes no tolerance and settles
// nothing. It imports no hold family, no engine entry point, no export path and no database
// client. Four independent things hold that down and only one of them is this comment:
//
//   TYPES      `MODEL_JOURNAL_EVENTS` is two events wide and `journal.ts` fails the
//              typecheck if a release event is ever added to it.
//   SCHEMA     `match_candidates_unverified_cannot_clear` refuses `cleared` on a candidate
//              that is not `reverified`; `audit_journal_model_actor_only_proposes` refuses
//              to record a model actor on anything but a proposal event; and a
//              `hold_released` row must name a human or the system.
//   RUNTIME    `assertModelActorOnlyProposes` throws on the way out of both entry points.
//   TEST       `llm/boundary.test.ts` walks the value-import graph out of every file here
//              and fails if any of it can reach a hold release. Run it with
//              `node_modules/.bin/tsx llm/boundary.test.ts`.
//
// ─── DEGRADED MODE ───────────────────────────────────────────────────────────────────
//
// With no `ANTHROPIC_API_KEY` the residual pass does not run, says so in its notes, and
// proposes nothing. It never invents a pairing and never reports an absent pass as an empty
// one — those are different facts and the record keeps them apart.

// ── Entry point 1: the call site ─────────────────────────────────────────────
export type { ProposalCitation, ProposeOptions, ResidualProposalBatch } from './propose';
export { credentialsPresent, proposeResiduals } from './propose';

// ── Entry point 2: the re-verify gate ────────────────────────────────────────
export type { AdmissionResult, AdmitOptions, DiscardedProposal, DiscardReason } from './gate';
export { admitProposals, DISCARD_REASONS } from './gate';

// ── The transport, and the model it is pinned to ─────────────────────────────
export type { ModelTransport, TransportRequest } from './client';
export { createTransport, DEFAULT_MODEL, MAX_OUTPUT_TOKENS } from './client';

// ── The answer shape ─────────────────────────────────────────────────────────
export type { CitableField, ResidualProposalResponse } from './schema';
export {
  CITABLE_FIELDS,
  MAX_PROPOSED_PAYMENTS,
  parseResidualResponse,
  RESIDUAL_SCHEMA_VERSION,
} from './schema';

// ── Cache by content hash ────────────────────────────────────────────────────
export type { CacheOptions, ContentCache } from './cache';
export { contentHash, createContentCache } from './cache';

// ── What a generated call may say about itself ───────────────────────────────
export type {
  BoundaryJournalEntry,
  JournalDetail,
  ModelActor,
  ModelJournalEvent,
  ProposalJournalEntry,
  ScoringJournalEntry,
  SystemActor,
} from './journal';
export {
  assertModelActorOnlyProposes,
  gateActor,
  GATE_COMPONENT,
  MODEL_JOURNAL_EVENTS,
  modelActor,
  RESIDUAL_CALL_SITE,
} from './journal';
