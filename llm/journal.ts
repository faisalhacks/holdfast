// W09 — what a generated call is allowed to say about itself.
//
// The audit journal already refuses to record a model releasing a hold. `011_audit_journal
// .sql` carries `audit_journal_model_actor_only_proposes`: a row whose `actor_kind` is
// `model` may only carry `invoice_ingested`, `payment_ingested`, `proposal_received` or
// `proposal_discarded`. A second constraint requires `hold_released` to name a human or the
// system. Those are the strongest guarantees in the build and they are enforced by the
// database, not by anybody's care.
//
// This module exists so that llm/ cannot be the weak link in that chain — so that a
// journal row llm/ is CAPABLE OF CONSTRUCTING is a strict subset of what the schema would
// accept, and the narrowing is visible at compile time rather than discovered at INSERT.
//
// Two events, and only two. Amendment 01 cut the ingestion-normalisation call site, so the
// other two members of the schema's allowance have no author here either.
//
// A model actor never appears on a scoring row. The gate's admissions are authored by a
// SYSTEM actor, because the deterministic scorer is what looked at the pairing — recording
// the model as the author of a score it did not produce would be the exact misattribution
// this file is here to prevent.

import type {
  Actor,
  AuditEntry,
  AuditEvent,
  EntityRef,
  InvoiceId,
  IsoTimestamp,
  LlmCallSite,
  MatchCandidateId,
} from '@/lib/types';

/** The model this worker calls. Pinned; the SDK in package.json predates the newer params. */
export const DEFAULT_MODEL = 'claude-opus-5';

/** The one call site W09 builds. `ingestion_normalisation` was cut and has no author. */
export const RESIDUAL_CALL_SITE: LlmCallSite = 'residual_proposal';

/** The component name that authors the gate's own rows. Deterministic code, named as such. */
export const GATE_COMPONENT = 'llm/gate:reverify';

export type ModelActor = Extract<Actor, { kind: 'model' }>;
export type SystemActor = Extract<Actor, { kind: 'system' }>;

/**
 * EVERY event a model actor may carry, in this codebase, for all time.
 *
 * Widening this list is the change the boundary test is watching for. `hold_released`,
 * `decision_recorded` and `tolerance_changed` are absent and the type assertions below
 * fail the typecheck if any of them is ever added.
 */
export const MODEL_JOURNAL_EVENTS = ['proposal_received', 'proposal_discarded'] as const;
export type ModelJournalEvent = (typeof MODEL_JOURNAL_EVENTS)[number];

/** The one event the gate authors, as a system actor, for a pairing it re-scored itself. */
export const SCORING_EVENT = 'candidate_scored' as const;

export type JournalDetail = Readonly<Record<string, string | number | boolean | null>>;

/** A row authored BY the model. Nomination, or the gate's refusal of one. */
export interface ProposalJournalEntry {
  readonly actor: ModelActor;
  readonly event: ModelJournalEvent;
  readonly entity: EntityRef;
  readonly occurred_at: IsoTimestamp;
  readonly detail: JournalDetail;
}

/** A row authored by the deterministic side, about a pairing it re-scored. */
export interface ScoringJournalEntry {
  readonly actor: SystemActor;
  readonly event: typeof SCORING_EVENT;
  readonly entity: EntityRef;
  readonly occurred_at: IsoTimestamp;
  readonly detail: JournalDetail;
}

export type BoundaryJournalEntry = ProposalJournalEntry | ScoringJournalEntry;

// ─────────────────────────────────────────────────────────────────────────────
// The narrowing, asserted at compile time
// ─────────────────────────────────────────────────────────────────────────────
//
// These are not documentation. `tsc --noEmit` is a required gate, so a future edit that
// lets a model actor carry a release event stops the build before any test runs.

type Assert<T extends true> = T;
type ContractRow = Pick<AuditEntry, 'actor' | 'event' | 'entity' | 'occurred_at' | 'detail'>;
type TheTwoEvents = 'proposal_received' | 'proposal_discarded';

/** Everything llm/ can construct is a well-formed contract journal row. */
export type _EntriesAreContractRows = Assert<
  BoundaryJournalEntry extends ContractRow ? true : false
>;
/** The model's events are audit events — a typo cannot invent a new one. */
export type _ModelEventsAreAuditEvents = Assert<ModelJournalEvent extends AuditEvent ? true : false>;
/**
 * THE INVARIANT, as a type. The model's event set is not merely a subset of the audit
 * events — it is EXACTLY these two, in both directions. Adding a release, a decision or a
 * tolerance change to `MODEL_JOURNAL_EVENTS` makes this line stop compiling, and the
 * typecheck is a required gate, so the build stops before any test runs.
 */
export type _ModelEventsAreExactlyTheTwo = Assert<
  [ModelJournalEvent] extends [TheTwoEvents]
    ? [TheTwoEvents] extends [ModelJournalEvent]
      ? true
      : false
    : false
>;

// ─────────────────────────────────────────────────────────────────────────────
// Constructors
// ─────────────────────────────────────────────────────────────────────────────

export function modelActor(modelId: string = DEFAULT_MODEL): ModelActor {
  return { kind: 'model', model_id: modelId, call_site: RESIDUAL_CALL_SITE };
}

export function gateActor(): SystemActor {
  return { kind: 'system', component: GATE_COMPONENT };
}

export function proposalReceived(
  actor: ModelActor,
  invoiceId: InvoiceId,
  occurredAt: IsoTimestamp,
  detail: JournalDetail,
): ProposalJournalEntry {
  return {
    actor,
    event: 'proposal_received',
    entity: { entity: 'invoice', id: invoiceId },
    occurred_at: occurredAt,
    detail,
  };
}

export function proposalDiscarded(
  actor: ModelActor,
  invoiceId: InvoiceId,
  occurredAt: IsoTimestamp,
  detail: JournalDetail,
): ProposalJournalEntry {
  return {
    actor,
    event: 'proposal_discarded',
    entity: { entity: 'invoice', id: invoiceId },
    occurred_at: occurredAt,
    detail,
  };
}

export function candidateScored(
  candidateId: MatchCandidateId,
  occurredAt: IsoTimestamp,
  detail: JournalDetail,
): ScoringJournalEntry {
  return {
    actor: gateActor(),
    event: SCORING_EVENT,
    entity: { entity: 'match_candidate', id: candidateId },
    occurred_at: occurredAt,
    detail,
  };
}

/**
 * The runtime half of the same claim, run on the way out of both entry points.
 *
 * The type assertions above cover the code as written; this covers a row assembled from
 * data at runtime. It throws rather than filtering — a journal that quietly dropped the row
 * it could not justify would be worse than no journal, and this is the one place in W09
 * where failing loudly is cheaper than any alternative.
 */
export function assertModelActorOnlyProposes(
  entries: readonly BoundaryJournalEntry[],
): readonly BoundaryJournalEntry[] {
  const permitted: readonly string[] = MODEL_JOURNAL_EVENTS;
  for (const entry of entries) {
    if (entry.actor.kind !== 'model') continue;
    if (!permitted.includes(entry.event)) {
      throw new Error(
        `llm/journal: a model actor was about to be recorded on "${entry.event}". ` +
          `A model actor proposes and nothing else; permitted events are ${permitted.join(', ')}.`,
      );
    }
  }
  return entries;
}
