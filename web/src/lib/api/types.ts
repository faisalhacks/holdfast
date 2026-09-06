/**
 * The UI domain contract.
 *
 * Every type below mirrors the frozen backend at v1.0-submission. The enumerations are
 * copied verbatim from the backend's `lib/types.ts`; the view models are assembled by the
 * live adapter from real response fields and nothing else. `docs/backend-integration.md`
 * records the field-by-field mapping.
 *
 * There is no field here carrying a model's own stated certainty, because there is no such
 * field in the backend. A candidate carries a deterministic score breakdown a reviewer can
 * reconstruct by addition, and that is what the UI renders.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Frozen backend enumerations — mirrored verbatim from lib/types.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Typed holds, mirroring Oracle Payables hold codes. A held invoice cannot be paid. */
export const HOLD_TYPES = [
  "matching",
  "price_variance",
  "quantity_variance",
  "tax_variance",
  "tax_amount_range",
  "dist_variance",
  "duplicate_candidate",
  "no_reference",
  "cardinality_residual",
  "period_deferral",
  "credit_note_crossing",
] as const;
export type HoldType = (typeof HOLD_TYPES)[number];

export const CONFLICT_SEVERITIES = ["advisory", "material", "blocking"] as const;
export type ConflictSeverity = (typeof CONFLICT_SEVERITIES)[number];

/** Four distinct AR application states, deliberately never collapsed. */
export const APPLICATION_STATUSES = [
  "applied",
  "unapplied",
  "on_account",
  "unidentified",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** What a reviewer actually chooses: who should act, never approve/reject. */
export const RESOLUTION_PATHS = [
  "re_application",
  "customer_outreach",
  "internal_correction",
] as const;
export type ResolutionPath = (typeof RESOLUTION_PATHS)[number];

export const OWNER_ROLES = [
  "ap_clerk",
  "ap_manager",
  "controller",
  "requisitioner",
  "tax_team",
  "treasury",
  "vendor",
] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

export const DECISION_ACTIONS = [
  "apply_hold",
  "release_hold",
  "change_tolerance",
  "route",
  "record_application_status",
  "create_feedback_rule",
  "escalate",
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** The subset POST /api/cases/{caseId}/decisions accepts. */
export const DECISION_ACTIONS_ACCEPTED = [
  "release_hold",
  "route",
  "escalate",
  "record_application_status",
] as const;
export type AcceptedDecisionAction = (typeof DECISION_ACTIONS_ACCEPTED)[number];

export const CARDINALITY_KINDS = [
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "many_to_many",
  "partial",
] as const;
export type CardinalityKind = (typeof CARDINALITY_KINDS)[number];

/** Where a candidate pairing came from. A model proposal is a nomination, never a verdict. */
export const PROPOSAL_SOURCES = [
  "deterministic_exact",
  "deterministic_fuzzy",
  "cardinality_search",
  "feedback_rule",
  "model_proposal",
] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

export const RUN_KINDS = ["baseline", "engine", "rerun"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RUN_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const AUDIT_EVENTS = [
  "invoice_ingested",
  "payment_ingested",
  "run_started",
  "run_completed",
  "candidate_scored",
  "hold_applied",
  "hold_released",
  "decision_recorded",
  "tolerance_changed",
  "feedback_rule_created",
  "feedback_rule_deactivated",
  "application_status_changed",
  "proposal_received",
  "proposal_discarded",
  "export_generated",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export type ActorKind = "human" | "system" | "model";

export const TOLERANCE_KINDS = [
  "exact",
  "absolute_paise",
  "percentage",
  "days",
  "similarity",
] as const;
export type ToleranceKind = (typeof TOLERANCE_KINDS)[number];

export type ToleranceScopeKind = "global" | "vendor" | "hold_type" | "invoice";

export type ConflictCode = string;
export type DeltaCause = string;
export type EvidenceField = "vendor" | "amount" | "date" | "reference";

// ─────────────────────────────────────────────────────────────────────────────
// Money
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An exact integer count of paise.
 *
 * The backend publishes a monetary field either as `<name>_paise` (a safe IEEE-754
 * integer) or, when the exact value falls outside that range, as `<name>_paise_string`
 * carrying the decimal digits. Both arrive here as `digits`, so no monetary value is ever
 * held as a float in this codebase. `safe` is the number form when one exists, offered
 * only for comparison and sorting — never for formatting.
 */
export interface Money {
  readonly digits: string;
  readonly safe: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tolerance
// ─────────────────────────────────────────────────────────────────────────────

export type Tolerance =
  | { readonly kind: "exact" }
  | { readonly kind: "absolute_paise"; readonly value: Money }
  | { readonly kind: "percentage"; readonly value: number }
  | { readonly kind: "days"; readonly value: number }
  | { readonly kind: "similarity"; readonly value: number };

export type ToleranceScope =
  | { readonly kind: "global" }
  | { readonly kind: "vendor"; readonly vendor_id: string }
  | { readonly kind: "hold_type"; readonly hold_type: HoldType }
  | { readonly kind: "invoice"; readonly invoice_id: string };

export type ToleranceDirection = "widened" | "narrowed" | "unchanged" | "retyped";

// ─────────────────────────────────────────────────────────────────────────────
// Conflicts, holds, evidence
// ─────────────────────────────────────────────────────────────────────────────

/** The machine-readable reason a hold fired. `clause` is a short fixed phrase. */
export interface Conflict {
  readonly code: ConflictCode;
  readonly field_path: string;
  readonly clause: string;
  readonly severity: ConflictSeverity;
}

export interface HoldPolicy {
  readonly type: HoldType;
  readonly auto_releasable: boolean;
  readonly blocks_accounting: boolean;
  readonly default_severity: ConflictSeverity;
  readonly clause: string;
}

/** A hold on an invoice, as the queue and the dossier both report it. */
export interface Hold {
  readonly id: string;
  readonly type: HoldType;
  readonly reason: string;
  readonly severity: ConflictSeverity;
  readonly auto_releasable: boolean;
  readonly blocks_accounting: boolean;
  readonly is_open: boolean;
  readonly released_by: string | null;
  readonly released_at: string | null;
  readonly release_reason: string | null;
  readonly conflicts: readonly Conflict[];
  readonly policy: HoldPolicy | null;
  /** Dossier only: the backend's own phrasing of what releasing this hold requires. */
  readonly release_requires: string | null;
}

/** A deterministic normaliser's rewrite of a raw value, with the rule that did it. */
export interface NormalisationNote {
  readonly side: "invoice" | "payment";
  readonly raw_value: string;
  readonly normalised_value: string;
  readonly rule: string;
  readonly feedback_rule_id: string | null;
}

/**
 * One compared field, aligned side by side.
 *
 * `delta` is in that field's own units and its meaning depends on `field`: a token-set
 * similarity ratio for vendor and reference, signed paise for amount, signed whole days
 * for date. `deltaKind` says which, so nothing has to sniff a label to find out.
 */
export interface EvidenceRow {
  readonly field: EvidenceField;
  readonly path: string;
  readonly invoiceValue: string | Money | null;
  readonly paymentValue: string | Money | null;
  readonly tolerance: Tolerance;
  readonly within_tolerance: boolean;
  readonly normalisation: NormalisationNote | null;
  readonly deltaKind: "similarity" | "paise" | "days";
  readonly deltaRatio: number | null;
  readonly deltaMoney: Money | null;
  readonly deltaDays: number | null;
  readonly cause: DeltaCause | null;
  readonly displaced: boolean;
  readonly displaced_from: string | null;
}

export interface ScoreComponent {
  readonly score: number;
  readonly weight: number;
  readonly contribution: number;
}

/** Every input to the composite, itemised, so a reviewer can re-add it by hand. */
export interface ScoreBreakdown {
  readonly amount: ScoreComponent;
  readonly reference: ScoreComponent;
  readonly date: ScoreComponent;
  readonly vendor: ScoreComponent;
  readonly weights: Readonly<Record<EvidenceField, number>>;
  readonly composite: number;
  readonly scorer_version: string;
}

export interface PaymentLine {
  readonly id: string;
  readonly value_date: string;
  readonly amount: Money;
  readonly narration_raw: string;
  readonly reference_extracted: string | null;
  readonly vendor_name_extracted: string | null;
  readonly application_status: ApplicationStatus;
  readonly bank_transaction_id: string;
}

export interface MatchCandidate {
  readonly id: string;
  readonly cardinality: CardinalityKind;
  readonly score: ScoreBreakdown;
  readonly evidence: readonly EvidenceRow[];
  readonly conflicts: readonly Conflict[];
  readonly residual: Money;
  readonly settled: Money;
  readonly proposed_by: ProposalSource;
  readonly reverified: boolean;
  readonly rank: number;
  readonly payments: readonly PaymentLine[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing, decisions, tolerance changes
// ─────────────────────────────────────────────────────────────────────────────

export interface OwnerNext {
  readonly role: OwnerRole;
  readonly party: string | null;
}

/** Policy-derived, never model-derived. The backend labels it a suggestion; so do we. */
export interface RoutingSuggestion {
  readonly owner_role: OwnerRole;
  readonly resolution_path: ResolutionPath;
  readonly decided_by_hold_type: HoldType;
  readonly because: string;
  readonly note: string;
}

export interface Decision {
  readonly id: string;
  readonly run_id: string;
  readonly case_id: string;
  readonly invoice_id: string;
  readonly action: DecisionAction;
  readonly resolution_path: ResolutionPath | null;
  readonly owner_next: OwnerNext;
  readonly reviewer: string;
  readonly reason: string;
  readonly timestamp: string;
  readonly hold_ids: readonly string[];
  readonly tolerance_change_id: string | null;
}

export interface ToleranceChange {
  readonly id: string;
  readonly decision_id: string;
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly scope: ToleranceScope;
  readonly direction: ToleranceDirection;
  readonly scope_description: string;
  readonly reviewer: string;
  readonly reason: string;
  readonly timestamp: string;
  readonly affected_hold_ids: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice, vendor
// ─────────────────────────────────────────────────────────────────────────────

export interface Vendor {
  readonly id: string;
  readonly name: string;
  readonly normalised_name: string;
  readonly tax_identifier: string | null;
}

export interface Invoice {
  readonly id: string;
  readonly reference: string;
  readonly vendor_id: string;
  readonly vendor_name_raw: string;
  readonly invoice_date: string;
  readonly received_date: string;
  readonly due_date: string | null;
  readonly period: string;
  readonly gross: Money;
  readonly net: Money;
  readonly tax_total: Money;
  readonly currency: string;
  readonly is_credit_note: boolean;
  readonly recurrence: string | null;
  readonly purchase_order_reference: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row of GET /api/runs/{runId}/queue.
 *
 * The queue is ordered by money at risk descending, by the backend. Nothing here re-sorts.
 */
export interface QueueCase {
  readonly case_id: string;
  readonly run_id: string;
  readonly invoice_id: string;
  readonly money_at_risk: Money;
  readonly held_since: string;
  readonly age_days: number;
  readonly blocks_accounting: boolean;
  readonly application_status: ApplicationStatus;
  readonly payable: boolean;
  readonly holds: readonly Hold[];
  readonly openHolds: readonly Hold[];
  /** Highest `ConflictSeverity` among the open holds. Derived, not a backend field. */
  readonly severity: ConflictSeverity | null;
  readonly topCandidate: {
    readonly id: string;
    readonly cardinality: CardinalityKind;
    readonly payment_count: number;
    readonly composite: number;
    readonly scorer_version: string;
    readonly residual: Money;
    readonly proposed_by: ProposalSource;
    readonly reverified: boolean;
    readonly conflict_codes: readonly ConflictCode[];
  } | null;
  readonly decision: Decision | null;
  readonly suggested_next: RoutingSuggestion | null;
}

/** Server-side query parameters. Every one of these is supported by the backend route. */
export interface QueueQuery {
  readonly hold_type?: HoldType | "all";
  readonly blocks_accounting?: boolean | null;
  readonly undecided_only?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface QueuePage {
  readonly run_id: string;
  readonly ordering: string;
  readonly limit: number;
  readonly offset: number;
  readonly returned: number;
  readonly total_matching: number;
  readonly has_more: boolean;
  readonly money_at_risk_total: Money;
  readonly cases: readonly QueueCase[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Run overview
// ─────────────────────────────────────────────────────────────────────────────

export interface RunTotals {
  readonly invoices_total: number;
  readonly payments_total: number;
  readonly decided_count: number;
  readonly coverage: number;
  readonly auto_cleared_count: number;
  readonly held_count: number;
  readonly human_required_count: number;
  readonly unmatched_count: number;
  readonly conflicts_emitted: number;
  readonly held_invoices_without_conflict: number;
  readonly amount_invoiced: Money;
  readonly amount_auto_cleared: Money;
  readonly amount_held: Money;
  readonly holds_by_type: Readonly<Record<HoldType, number>>;
}

export interface HoldMixEntry {
  readonly hold_type: HoldType;
  readonly open_count: number;
  readonly released_count: number;
  readonly policy: HoldPolicy | null;
}

export interface RunOverview {
  readonly run_id: string;
  readonly kind: RunKind;
  readonly status: RunStatus;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly engine_version: string;
  readonly scorer_version: string;
  readonly parent_run_id: string | null;
  readonly totals: RunTotals | null;
  readonly outcome_mix: {
    readonly auto_cleared: number;
    readonly held: number;
    readonly unmatched: number;
  };
  readonly holds: {
    readonly open_count: number;
    readonly released_count: number;
    readonly released_by_a_named_human: number;
    readonly by_type: readonly HoldMixEntry[];
  };
  readonly exceptions: {
    readonly open_case_count: number;
    readonly money_at_risk: Money;
  };
  readonly reviewer_activity: {
    readonly decision_count: number;
    readonly distinct_reviewers: number;
    readonly tolerance_change_count: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Case dossier
// ─────────────────────────────────────────────────────────────────────────────

export interface WhyHeld {
  readonly hold_id: string;
  readonly hold_type: HoldType;
  readonly clause: string;
  readonly severity: ConflictSeverity;
  readonly blocks_accounting: boolean;
  readonly conflicts: readonly Conflict[];
}

export interface SameAmountInvoice {
  readonly invoice_id: string;
  readonly reference: string;
  readonly invoice_date: string;
  readonly period: string;
  readonly gross: Money;
  readonly days_from_this_invoice: number;
  readonly purchase_order_reference: string | null;
}

export interface CaseDossier {
  readonly case_id: string;
  readonly run_id: string;
  readonly invoice_id: string;
  readonly money_at_risk: Money;
  readonly held_since: string;
  readonly age_days: number;
  readonly application_status: ApplicationStatus;
  readonly blocks_accounting: boolean;
  readonly payable: boolean;
  readonly open_hold_count: number;
  readonly released_hold_count: number;
  /** Highest `ConflictSeverity` among the open holds. Derived, not a backend field. */
  readonly severity: ConflictSeverity | null;
  readonly invoice: Invoice;
  readonly vendor: Vendor;
  readonly holds: readonly Hold[];
  readonly openHolds: readonly Hold[];
  readonly candidates: readonly MatchCandidate[];
  readonly money: {
    readonly invoice_gross: Money;
    readonly invoice_net: Money;
    readonly tax_total: Money;
    readonly settled_on_top_candidate: Money | null;
    readonly residual_on_top_candidate: Money | null;
  };
  readonly duplicate_context: {
    readonly same_vendor_invoice_count: number;
    readonly vendor_exposure: Money;
    readonly same_amount_invoices: readonly SameAmountInvoice[];
  };
  readonly decisions: readonly Decision[];
  readonly tolerance_changes: readonly ToleranceChange[];
  readonly why_held: readonly WhyHeld[];
  readonly suggested_next: RoutingSuggestion | null;
  readonly audit: AuditSlice;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit journal
// ─────────────────────────────────────────────────────────────────────────────

export type AuditActor =
  | { readonly kind: "human"; readonly reviewer: string }
  | { readonly kind: "system"; readonly component: string }
  | { readonly kind: "model"; readonly model_id: string; readonly call_site: string };

export interface AuditEntry {
  readonly id: string;
  readonly sequence: number;
  readonly occurred_at: string;
  readonly recorded_at: string;
  readonly actor: AuditActor;
  readonly event: AuditEvent;
  readonly entity: { readonly entity: string; readonly id: string };
  readonly run_id: string | null;
  readonly case_id: string | null;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
  readonly payload_hash: string;
  readonly prev_hash: string | null;
}

/** The backend's own chain report over the slice it returned. Rendered verbatim. */
export interface ChainReport {
  readonly first_sequence: number | null;
  readonly last_sequence: number | null;
  readonly entries_examined: number;
  readonly missing_sequences: readonly number[];
  readonly unverifiable_entries: readonly string[];
  readonly broken_links: readonly string[];
  readonly intact: boolean;
  readonly contiguous: boolean;
  readonly note: string;
}

export interface AuditSlice {
  readonly entries: readonly AuditEntry[];
  readonly chain: ChainReport;
  readonly actors: readonly { readonly actor: string; readonly entry_count: number }[];
}

export interface AuditQuery {
  readonly run_id?: string | null;
  readonly case_id?: string | null;
  readonly event?: AuditEvent | "all";
  readonly entity_id?: string | null;
  readonly limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/** Body of POST /api/cases/{caseId}/decisions. Field names are the backend's. */
export interface RecordDecisionInput {
  readonly action: AcceptedDecisionAction;
  readonly reviewer: string;
  readonly reason: string;
  readonly resolution_path: ResolutionPath | null;
  readonly owner_next: OwnerNext;
  readonly hold_ids?: readonly string[];
  readonly application_status?: ApplicationStatus;
  readonly payment_id?: string | null;
}

export interface DecisionOutcome {
  readonly decision: Decision;
  readonly released_hold_ids: readonly string[];
  readonly application_status: ApplicationStatus | null;
  readonly journal_entries: readonly AuditEntry[];
}

/** Body of POST /api/tolerance-changes. Field names are the backend's. */
export interface ChangeToleranceInput {
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly scope: ToleranceScope;
  readonly reviewer: string;
  readonly reason: string;
  readonly case_id: string;
  readonly owner_next: OwnerNext;
  readonly release_affected_holds: boolean;
}

export interface HoldInScope {
  readonly id: string;
  readonly type: HoldType;
  readonly case_id: string;
  readonly invoice_id: string;
  readonly severity: ConflictSeverity;
  readonly auto_releasable: boolean;
  readonly blocks_accounting: boolean;
  readonly invoice_gross: Money | null;
}

export interface ToleranceChangeOutcome {
  readonly tolerance_change: ToleranceChange;
  readonly decision: Decision;
  readonly direction: ToleranceDirection;
  readonly scope_description: string;
  readonly holds_in_scope: readonly HoldInScope[];
  readonly released_hold_ids: readonly string[];
  readonly holds_left_untouched: readonly string[];
  readonly journal_entries: readonly AuditEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The 428 human-approval preview
// ─────────────────────────────────────────────────────────────────────────────

/** Preview the backend returns before it will release holds on a case. */
export interface ReleaseHoldPreview {
  readonly operation: "release_hold";
  readonly case_id: string;
  readonly invoice_id: string;
  readonly holds_to_release: readonly {
    readonly id: string;
    readonly type: HoldType;
    readonly severity: ConflictSeverity;
    readonly auto_releasable: boolean;
    readonly blocks_accounting: boolean;
    readonly reason: string;
    readonly conflicts: readonly Conflict[];
  }[];
  readonly holds_still_open_afterwards: readonly {
    readonly id: string;
    readonly type: HoldType;
  }[];
  readonly document_becomes_payable: boolean;
  readonly invoice_gross: Money;
  readonly money_at_risk: Money;
  readonly releases_a_hold_that_would_not_lift_on_its_own: boolean;
}

/** Preview the backend returns before a tolerance change may release the holds it governs. */
export interface ToleranceReleasePreview {
  readonly operation: "tolerance_change_release";
  readonly direction: ToleranceDirection;
  readonly scope: ToleranceScope;
  readonly scope_description: string;
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly holds_that_would_release: readonly HoldInScope[];
  readonly holds_that_would_release_count: number;
  readonly money_that_would_stop_being_held: Money;
  readonly includes_holds_that_would_not_lift_on_their_own: boolean;
  readonly widening: boolean;
}

export type ApprovalPreview = ReleaseHoldPreview | ToleranceReleasePreview;

/**
 * Thrown on HTTP 428. Carries the backend's own preview so the UI can render an accurate
 * confirmation rather than a generic one, then repeat the request with the approval header.
 */
export class ApprovalRequiredError extends Error {
  readonly preview: ApprovalPreview;
  readonly approvalHeader: string;
  readonly approvalValue: string;

  constructor(
    message: string,
    preview: ApprovalPreview,
    approvalHeader: string,
    approvalValue: string,
  ) {
    super(message);
    this.name = "ApprovalRequiredError";
    this.preview = preview;
    this.approvalHeader = approvalHeader;
    this.approvalValue = approvalValue;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** A backend error that is not one of the shapes above, carrying its contract error code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter surface
// ─────────────────────────────────────────────────────────────────────────────

export interface AdapterNotice {
  readonly level: "demo" | "info" | "warning";
  readonly message: string;
}

export interface MutationResult<T> {
  readonly data: T;
  readonly notice?: AdapterNotice;
}

export interface AdapterInfo {
  readonly id: string;
  readonly label: string;
  readonly isMock: boolean;
  readonly description: string;
}

/**
 * Approval a named human gave in the browser for one destructive request.
 *
 * `reviewer` is echoed into the approval header, which the backend requires to equal the
 * `reviewer` in the body — a machine cannot approve on a person's behalf by omission.
 */
export interface Approval {
  readonly reviewer: string;
}

export interface HoldfastApi {
  readonly info: AdapterInfo;
  getRun(runId: string): Promise<RunOverview>;
  getQueue(runId: string, query?: QueueQuery): Promise<QueuePage>;
  getCase(caseId: string): Promise<CaseDossier | null>;
  getAudit(query?: AuditQuery): Promise<AuditSlice>;
  recordDecision(
    caseId: string,
    input: RecordDecisionInput,
    approval?: Approval,
  ): Promise<MutationResult<DecisionOutcome>>;
  changeTolerance(
    input: ChangeToleranceInput,
    approval?: Approval,
  ): Promise<MutationResult<ToleranceChangeOutcome>>;
}
