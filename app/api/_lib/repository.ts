// The repository interface.
//
// The API reads TABLES. It never calls an engine function, never re-runs a matcher and
// never asks a model anything, which is why these routes could be finished before the
// engine, the schema or the dataset existed.
//
// Two implementations satisfy this interface:
//   ./memory-repository.ts  seeded with representative rows, the default
//   ./pg-repository.ts      `pg` against the real schema, selected by HOLDFAST_REPO=pg
//
// Every operation is expressed in terms of `lib/types.ts`. There is deliberately no
// removal operation of any kind: holds are released, feedback rules are deactivated, and
// the journal only ever grows.

import type {
  Actor,
  ApplicationStatus,
  AuditEntry,
  AuditEvent,
  CaseId,
  Decision,
  DecisionAction,
  DecisionId,
  EntityRef,
  ExceptionCase,
  FeedbackRuleBody,
  FeedbackRule,
  FeedbackRuleId,
  Hold,
  HoldId,
  HoldPolicy,
  HoldType,
  Invoice,
  InvoiceId,
  IsoTimestamp,
  MatchCandidate,
  MatchStatus,
  OwnerNext,
  Paise,
  Payment,
  PaymentId,
  ResolutionPath,
  ReviewerId,
  Run,
  RunId,
  RunKind,
  Sha256,
  Tolerance,
  ToleranceChange,
  ToleranceChangeId,
  ToleranceScope,
  Vendor,
} from '@/lib/types';

export type RepositoryKind = 'memory' | 'postgres';

export interface RepositoryStatus {
  readonly kind: RepositoryKind;
  readonly ready: boolean;
  /** Connectivity, row counts, missing tables — whatever the implementation can prove. */
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

// ── runs ────────────────────────────────────────────────────────────────────────

/**
 * Everything a caller may supply when opening a run. The hashes and versions are optional
 * because they belong to the engine and the frozen dataset, not to a person clicking a
 * button; when omitted they are inherited from the most recent run.
 */
export interface RunDraft {
  readonly id: RunId;
  readonly kind: RunKind;
  readonly idempotency_key: string;
  readonly parent_run_id: RunId | null;
  readonly dataset_hash: Sha256;
  readonly thresholds_hash: Sha256;
  readonly engine_version: string;
  readonly scorer_version: string;
  readonly feedback_rule_ids: readonly FeedbackRuleId[];
  readonly started_at: IsoTimestamp;
}

/** One row per invoice in a run — the shape a diff between two runs is computed from. */
export interface OutcomeRow {
  readonly run_id: RunId;
  readonly invoice_id: InvoiceId;
  readonly case_id: CaseId | null;
  readonly status: MatchStatus;
  readonly hold_types: readonly HoldType[];
  readonly money_at_risk_paise: Paise;
}

// ── queue ───────────────────────────────────────────────────────────────────────

export interface QueueQuery {
  readonly hold_type: HoldType | null;
  readonly blocks_accounting: boolean | null;
  readonly undecided_only: boolean;
  readonly limit: number;
  readonly offset: number;
}

export interface QueuePage {
  /** Ordered by money_at_risk_paise DESCENDING. Not by score, not by age. */
  readonly cases: readonly ExceptionCase[];
  readonly total_matching: number;
  /** Exact sum across the whole filter, not just the page. Kept in bigint. */
  readonly money_at_risk_total: bigint;
}

// ── one case, everything about it ───────────────────────────────────────────────

/**
 * Every row a reviewer needs to decide one case, fetched together. Assembling this is the
 * whole point of the API: today a reviewer reconstructs it from five or six screens.
 */
export interface CaseBundle {
  readonly exception: ExceptionCase;
  readonly invoice: Invoice;
  readonly vendor: Vendor | null;
  readonly holds: readonly Hold[];
  readonly candidates: readonly MatchCandidate[];
  /** Every payment referenced by any candidate on this case. */
  readonly payments: readonly Payment[];
  readonly decisions: readonly Decision[];
  /** Tolerance changes whose affected holds intersect this case. */
  readonly tolerance_changes: readonly ToleranceChange[];
  /** Feedback rules cited by a normalisation note in this case's evidence. */
  readonly feedback_rules: readonly FeedbackRule[];
  readonly audit: readonly AuditEntry[];
  /** Other invoices from the same vendor in the same run — the duplicate context. */
  readonly vendor_invoices: readonly Invoice[];
}

// ── writes ──────────────────────────────────────────────────────────────────────

export interface HoldReleaseInput {
  readonly hold_ids: readonly HoldId[];
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly released_at: IsoTimestamp;
}

/**
 * Identifiers are minted by the caller, not by the repository, so a decision and the
 * tolerance change it records can name each other without a second write.
 */
export interface DecisionDraft {
  readonly id: DecisionId;
  readonly run_id: RunId;
  readonly case_id: CaseId;
  readonly invoice_id: InvoiceId;
  readonly action: DecisionAction;
  readonly resolution_path: ResolutionPath | null;
  readonly owner_next: OwnerNext;
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly timestamp: IsoTimestamp;
  readonly hold_ids: readonly HoldId[];
  readonly tolerance_change_id: ToleranceChangeId | null;
}

export interface ToleranceChangeDraft {
  readonly id: ToleranceChangeId;
  readonly decision_id: DecisionId | null;
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly scope: ToleranceScope;
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly timestamp: IsoTimestamp;
  readonly affected_hold_ids: readonly HoldId[];
  readonly run_id: RunId | null;
}

export interface FeedbackRuleDraft {
  readonly id: FeedbackRuleId;
  readonly body: FeedbackRuleBody;
  readonly learned_from_case_id: CaseId;
  readonly created_by: ReviewerId;
  readonly created_at: IsoTimestamp;
  readonly reason: string;
}

export interface ApplicationStatusInput {
  readonly case_id: CaseId;
  readonly payment_id: PaymentId | null;
  readonly status: ApplicationStatus;
}

export interface DecisionQuery {
  readonly run_id: RunId | null;
  readonly case_id: CaseId | null;
}

export interface AuditQuery {
  readonly run_id: RunId | null;
  readonly case_id: CaseId | null;
  readonly event: AuditEvent | null;
  readonly entity_id: string | null;
  readonly after_sequence: number | null;
  readonly limit: number;
}

/** An entry before the journal seals it with a sequence, a payload hash and a prev hash. */
export interface AuditDraft {
  readonly occurred_at: IsoTimestamp;
  readonly actor: Actor;
  readonly event: AuditEvent;
  readonly entity: EntityRef;
  readonly run_id: RunId | null;
  readonly case_id: CaseId | null;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

// ── the interface ───────────────────────────────────────────────────────────────

export interface Repository {
  readonly kind: RepositoryKind;
  status(): Promise<RepositoryStatus>;

  listRuns(limit: number): Promise<readonly Run[]>;
  getRun(id: RunId): Promise<Run | null>;
  getRunByIdempotencyKey(key: string): Promise<Run | null>;
  latestRun(): Promise<Run | null>;
  insertRun(draft: RunDraft): Promise<Run>;

  listOutcomes(runId: RunId): Promise<readonly OutcomeRow[]>;
  listExceptionCases(runId: RunId, query: QueueQuery): Promise<QueuePage>;
  getCaseBundle(caseId: CaseId): Promise<CaseBundle | null>;

  holdPolicies(): Promise<readonly HoldPolicy[]>;
  listHolds(runId: RunId): Promise<readonly Hold[]>;
  getHolds(ids: readonly HoldId[]): Promise<readonly Hold[]>;
  /** Sets the three released_* fields together. There is no un-release and no removal. */
  releaseHolds(input: HoldReleaseInput): Promise<readonly Hold[]>;

  getInvoices(ids: readonly InvoiceId[]): Promise<readonly Invoice[]>;

  listDecisions(query: DecisionQuery): Promise<readonly Decision[]>;
  insertDecision(draft: DecisionDraft): Promise<Decision>;

  listToleranceChanges(runId: RunId | null): Promise<readonly ToleranceChange[]>;
  insertToleranceChange(draft: ToleranceChangeDraft): Promise<ToleranceChange>;

  listFeedbackRules(activeOnly: boolean): Promise<readonly FeedbackRule[]>;
  getFeedbackRule(id: FeedbackRuleId): Promise<FeedbackRule | null>;
  insertFeedbackRule(draft: FeedbackRuleDraft): Promise<FeedbackRule>;
  /** Deactivation, never removal — the row stays and records who stood it down. */
  deactivateFeedbackRule(
    id: FeedbackRuleId,
    reviewer: ReviewerId,
    at: IsoTimestamp,
  ): Promise<FeedbackRule>;

  recordApplicationStatus(input: ApplicationStatusInput): Promise<ApplicationStatus>;

  listAuditEntries(query: AuditQuery): Promise<readonly AuditEntry[]>;
  appendAuditEntries(drafts: readonly AuditDraft[]): Promise<readonly AuditEntry[]>;
}
