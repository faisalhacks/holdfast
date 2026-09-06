// HOLDFAST — the contract. Owned by W01, frozen the moment it lands.
//
// Types and pure type-level helpers only. No implementation logic lives here; runtime
// constructors for the branded scalars live in lib/brands.ts.
//
// Three commitments are expressed structurally rather than by convention, so that a
// downstream worker cannot quietly break them:
//
//   1. Money is `Paise` — an integer count of minor units, never a float, never a string.
//      Every monetary column is BIGINT. There is no `rupees` field anywhere.
//   2. The domain object is a HOLD, not a match verdict. A hold carries who may release
//      it, whether it releases itself, and whether accounting may proceed while it is on.
//   3. A tolerance change is a DECISION — reviewer, reason, timestamp, affected holds —
//      and is recorded in the same journal as any other decision. It is not config.
//
// Absent by design: any field carrying a model's own stated certainty. A generated score
// is not evidence and there is nowhere in this contract to put one. What a model produces
// is a PROPOSAL, re-scored by the same deterministic scorer as any other candidate.

// ─────────────────────────────────────────────────────────────────────────────
// Branding
// ─────────────────────────────────────────────────────────────────────────────

declare const brandKey: unique symbol;

/** Nominal typing helper. `Brand<number, 'Paise'>` is not assignable from a bare number. */
export type Brand<T, B extends string> = T & { readonly [brandKey]: B };

/** Strips a brand back to its underlying primitive. Type-level only. */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;

// ─────────────────────────────────────────────────────────────────────────────
// Scalars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Integer minor units. Rs 1,234.50 is `123450 as Paise`. Stored BIGINT.
 * Signed: a delta or a residual may legitimately be negative.
 */
export type Paise = Brand<number, 'Paise'>;

/** Calendar date, `YYYY-MM-DD`. Stored DATE. */
export type IsoDate = Brand<string, 'IsoDate'>;

/** Instant, RFC 3339 with offset, e.g. `2026-03-31T09:15:00.000Z`. Stored TIMESTAMPTZ. */
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;

/** A proportion in [0, 1]. Coverage, recall, precision, similarity, weights. */
export type Ratio = number;

/** Whole days. Date deltas and ageing. */
export type Days = number;

/** sha256 hex digest. */
export type Sha256 = Brand<string, 'Sha256'>;

/** A dotted path into a contract object, e.g. `invoice.vendor.name`. */
export type FieldPath = Brand<string, 'FieldPath'>;

// ── Identifiers ──────────────────────────────────────────────────────────────

export type InvoiceId = Brand<string, 'InvoiceId'>;
export type PaymentId = Brand<string, 'PaymentId'>;
export type VendorId = Brand<string, 'VendorId'>;
export type HoldId = Brand<string, 'HoldId'>;
export type DecisionId = Brand<string, 'DecisionId'>;
export type ToleranceChangeId = Brand<string, 'ToleranceChangeId'>;
export type FeedbackRuleId = Brand<string, 'FeedbackRuleId'>;
export type MatchCandidateId = Brand<string, 'MatchCandidateId'>;
export type RunId = Brand<string, 'RunId'>;
export type AuditEntryId = Brand<string, 'AuditEntryId'>;
/** A reviewer is always NAMED. Anonymous release is not representable. */
export type ReviewerId = Brand<string, 'ReviewerId'>;
/**
 * The unit of review: one invoice under examination in one run. Feedback rules cite the
 * case they came from, which is what gives a persisted mapping its provenance.
 */
export type CaseId = Brand<string, 'CaseId'>;

// ─────────────────────────────────────────────────────────────────────────────
// Enumerations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The typed holds. Mirrors Oracle Payables hold codes. A held invoice cannot be paid.
 * `registry.ts` names one slot per member; adding a member here is a contract change.
 */
export const HOLD_TYPES = [
  'matching',
  'price_variance',
  'quantity_variance',
  'tax_variance',
  'tax_amount_range',
  'dist_variance',
  'duplicate_candidate',
  'no_reference',
  'cardinality_residual',
  'period_deferral',
  'credit_note_crossing',
] as const;
export type HoldType = (typeof HOLD_TYPES)[number];

/**
 * Oracle AR application states. FOUR distinct states, deliberately not collapsed:
 *  - `applied`      settled against a known invoice
 *  - `unapplied`    payer is known, the invoice is not
 *  - `on_account`   deliberately parked as a credit against the payer
 *  - `unidentified` the payer itself is unknown
 * Collapsing `unapplied` and `unidentified` destroys the routing decision: one goes to
 * customer outreach, the other to internal correction.
 */
export const APPLICATION_STATUSES = [
  'applied',
  'unapplied',
  'on_account',
  'unidentified',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * What a reviewer actually chooses. Never approve/reject — that framing asks a human to
 * ratify a machine's answer. This asks WHO SHOULD ACT.
 */
export const RESOLUTION_PATHS = [
  're_application',
  'customer_outreach',
  'internal_correction',
] as const;
export type ResolutionPath = (typeof RESOLUTION_PATHS)[number];

/** Who acts next. Routing is the product; this is the field it lands in. */
export const OWNER_ROLES = [
  'ap_clerk',
  'ap_manager',
  'controller',
  'requisitioner',
  'tax_team',
  'treasury',
  'vendor',
] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

export const DECISION_ACTIONS = [
  'apply_hold',
  'release_hold',
  'change_tolerance',
  'route',
  'record_application_status',
  'create_feedback_rule',
  'escalate',
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export const CONFLICT_SEVERITIES = ['advisory', 'material', 'blocking'] as const;
export type ConflictSeverity = (typeof CONFLICT_SEVERITIES)[number];

export const CONFLICT_CODES = [
  'vendor_mismatch',
  'vendor_below_similarity_floor',
  'amount_over_tolerance',
  'amount_over_cap',
  'date_outside_window',
  'reference_absent',
  'reference_mismatch',
  'reference_displaced',
  'tax_split_mismatch',
  'tax_total_mismatch',
  'duplicate_reference',
  'duplicate_vendor_amount_date',
  'residual_unsettled',
  'period_mismatch',
  'credit_note_crosses_period',
  'multiple_candidates_tied',
  'no_candidate_found',
] as const;
export type ConflictCode = (typeof CONFLICT_CODES)[number];

/** Which side of the reconciliation a value came from. */
export const SIDES = ['invoice', 'payment'] as const;
export type Side = (typeof SIDES)[number];

/** The declared stratification of the dataset. Always disclosed in the report. */
export const STRATA = [
  'clean',
  'duplicate',
  'tolerance',
  'cardinality',
  'reference',
  'period',
] as const;
export type Stratum = (typeof STRATA)[number];

/**
 * Where a candidate pairing came from. `model_proposal` is a nomination, never a verdict:
 * it enters the same scorer as every other candidate and is dropped if it does not clear.
 */
export const PROPOSAL_SOURCES = [
  'deterministic_exact',
  'deterministic_fuzzy',
  'cardinality_search',
  'feedback_rule',
  'model_proposal',
] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

/** The only two places a generated call may sit. Neither may reach a hold release. */
export const LLM_CALL_SITES = ['ingestion_normalisation', 'residual_proposal'] as const;
export type LlmCallSite = (typeof LLM_CALL_SITES)[number];

export const RUN_KINDS = ['baseline', 'engine', 'rerun'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** The two evaluated sets. The gate reads the selection set; holdout is reported beside it. */
export const EVAL_DATASETS = ['selection', 'holdout'] as const;
export type EvalDatasetName = (typeof EVAL_DATASETS)[number];

export const CARDINALITY_KINDS = [
  'one_to_one',
  'one_to_many',
  'many_to_one',
  'many_to_many',
  'partial',
] as const;
export type CardinalityKind = (typeof CARDINALITY_KINDS)[number];

/** Why a monetary delta exists, where the evidence supports an attribution. */
export const DELTA_CAUSES = [
  'bank_charge',
  'early_payment_discount',
  'tds_withholding',
  'rounding',
  'partial_settlement',
  'unattributed',
] as const;
export type DeltaCause = (typeof DELTA_CAUSES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Tolerance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tolerance is always a typed, named quantity — never a bare number floating in a
 * comparison. `tax_variance` and `tax_amount_range` are different hold codes precisely
 * because a percentage breach and an absolute breach are different events.
 */
export type Tolerance =
  | { readonly kind: 'exact' }
  | { readonly kind: 'absolute_paise'; readonly value: Paise }
  | { readonly kind: 'percentage'; readonly value: Ratio }
  | { readonly kind: 'days'; readonly value: Days }
  | { readonly kind: 'similarity'; readonly value: Ratio };

export type ToleranceKind = Tolerance['kind'];

/** What a tolerance applies to. A change is scoped, and the scope is part of the record. */
export type ToleranceScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'vendor'; readonly vendor_id: VendorId }
  | { readonly kind: 'hold_type'; readonly hold_type: HoldType }
  | { readonly kind: 'invoice'; readonly invoice_id: InvoiceId };

export type ToleranceScopeKind = ToleranceScope['kind'];

// ─────────────────────────────────────────────────────────────────────────────
// Evidence — field-level, structured, never narrative
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evidence is a discriminated union over the compared FIELD. Each member carries both
 * sides' values, the delta in that field's own units, the tolerance that was applied and
 * whether the delta fell within it.
 *
 * There is deliberately no `text`, `narrative`, `explanation` or `summary` member.
 * Fluent prose attached to a wrong match is how a reviewer rubber-stamps an error.
 */
export interface EvidenceBase<F extends string, V> {
  readonly field: F;
  readonly path: FieldPath;
  readonly invoice_value: V;
  readonly payment_value: V;
  readonly tolerance: Tolerance;
  readonly within_tolerance: boolean;
  /** Set when a normaliser rewrote a raw value; the reason it changed, not model prose. */
  readonly normalisation: NormalisationNote | null;
}

/** What a deterministic normaliser did and why, so the reviewer sees the raw value too. */
export interface NormalisationNote {
  readonly side: Side;
  readonly raw_value: string;
  readonly normalised_value: string;
  readonly rule: string;
  readonly feedback_rule_id: FeedbackRuleId | null;
}

export interface VendorEvidence extends EvidenceBase<'vendor', string | null> {
  /** Token-set similarity in [0, 1]. */
  readonly delta: Ratio;
  readonly invoice_vendor_id: VendorId | null;
  readonly payment_vendor_id: VendorId | null;
}

export interface AmountEvidence extends EvidenceBase<'amount', Paise | null> {
  /** payment minus invoice, in paise. Signed. */
  readonly delta: Paise;
  readonly cause: DeltaCause;
}

export interface DateEvidence extends EvidenceBase<'date', IsoDate | null> {
  /** payment date minus invoice date, in whole days. Signed. */
  readonly delta: Days;
}

export interface ReferenceEvidence extends EvidenceBase<'reference', string | null> {
  /** Token-set similarity in [0, 1]; 0 when one side carries no reference at all. */
  readonly delta: Ratio;
  /** True when the reference token was found in the wrong field — the displacement case. */
  readonly displaced: boolean;
  readonly displaced_from: FieldPath | null;
}

export type Evidence =
  | VendorEvidence
  | AmountEvidence
  | DateEvidence
  | ReferenceEvidence;

export type EvidenceField = Evidence['field'];

/** All four fields, aligned side by side. The detail screen renders exactly this. */
export interface EvidenceSet {
  readonly vendor: VendorEvidence;
  readonly amount: AmountEvidence;
  readonly date: DateEvidence;
  readonly reference: ReferenceEvidence;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflicts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A conflict is the machine-readable reason a hold fired. Every held invoice emits at
 * least one; an empty array is a policy bug and the eval fails loudly on it.
 * `clause` is a SHORT fixed phrase, not generated prose.
 */
export interface Conflict {
  readonly code: ConflictCode;
  readonly field_path: FieldPath;
  readonly clause: string;
  readonly severity: ConflictSeverity;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/** The declared weights. Fixed per scorer version and reported with every score. */
export interface ScoreWeights {
  readonly amount: Ratio;
  readonly reference: Ratio;
  readonly date: Ratio;
  readonly vendor: Ratio;
}

export interface ScoreComponent {
  /** The component's own score in [0, 1]. */
  readonly score: Ratio;
  /** The weight applied, from `ScoreWeights`. */
  readonly weight: Ratio;
  /** score x weight. Reported so the composite can be audited by addition. */
  readonly contribution: Ratio;
}

/**
 * Every input to the composite, itemised. A reviewer can reconstruct the number by hand.
 *
 * There is no field here for a model's own stated certainty, and there is not one
 * anywhere else in this contract either. A generated proposal is scored by this same
 * breakdown or it does not clear.
 */
export interface ScoreBreakdown {
  readonly amount: ScoreComponent;
  readonly reference: ScoreComponent;
  readonly date: ScoreComponent;
  readonly vendor: ScoreComponent;
  readonly weights: ScoreWeights;
  /** Sum of the four contributions, in [0, 1]. */
  readonly composite: Ratio;
  readonly scorer_version: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Holds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A hold on an invoice. A held invoice cannot be paid.
 *
 * `auto_releasable` — the hold lifts by itself once the condition resolves.
 * `blocks_accounting` — while true, no accounting entry may be created for the invoice.
 *   Some holds stop payment but permit accrual; the distinction is Oracle's and it is why
 *   this reads as a real AP system rather than a match flag.
 *
 * The three `released_*` fields move together. A hold released by a human always carries
 * BOTH a named reviewer and a reason; `ReleasedHold` below enforces that at the type level.
 */
export interface Hold {
  readonly id: HoldId;
  readonly run_id: RunId;
  readonly case_id: CaseId;
  readonly invoice_id: InvoiceId;
  readonly type: HoldType;
  /** Short fixed clause naming the condition. Not generated prose. */
  readonly reason: string;
  readonly applied_at: IsoTimestamp;
  readonly auto_releasable: boolean;
  readonly blocks_accounting: boolean;
  readonly severity: ConflictSeverity;
  readonly conflicts: readonly Conflict[];
  /** Null while held. A named human, or the system for an auto-release. */
  readonly released_by: ReviewerId | null;
  readonly released_at: IsoTimestamp | null;
  readonly release_reason: string | null;
}

/** A hold still in force. */
export interface ActiveHold extends Hold {
  readonly released_by: null;
  readonly released_at: null;
  readonly release_reason: null;
}

/** A released hold. Release is never silent: reviewer, instant and reason are all present. */
export interface ReleasedHold extends Hold {
  readonly released_by: ReviewerId;
  readonly released_at: IsoTimestamp;
  readonly release_reason: string;
}

export type HoldState = ActiveHold | ReleasedHold;

/** Static policy for a hold type. Owned by the registry, reported in the eval. */
export interface HoldPolicy {
  readonly type: HoldType;
  readonly auto_releasable: boolean;
  readonly blocks_accounting: boolean;
  readonly default_severity: ConflictSeverity;
  readonly clause: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices and payments
// ─────────────────────────────────────────────────────────────────────────────

export interface Vendor {
  readonly id: VendorId;
  readonly name: string;
  readonly normalised_name: string;
  /** GSTIN-style identifier. Synthetic; no real registrations appear in this project. */
  readonly tax_identifier: string | null;
}

/** Tax split. `total_paise` must equal igst + cgst + sgst + cess. */
export interface TaxBreakdown {
  readonly total_paise: Paise;
  readonly igst_paise: Paise;
  readonly cgst_paise: Paise;
  readonly sgst_paise: Paise;
  readonly cess_paise: Paise;
}

export interface Invoice {
  readonly id: InvoiceId;
  readonly reference: string;
  readonly normalised_reference: string;
  readonly vendor_id: VendorId;
  readonly vendor_name_raw: string;
  readonly invoice_date: IsoDate;
  readonly received_date: IsoDate;
  readonly due_date: IsoDate | null;
  /** Accounting period the invoice belongs to, `YYYY-MM`. */
  readonly period: string;
  readonly gross_paise: Paise;
  readonly net_paise: Paise;
  readonly tax: TaxBreakdown;
  readonly currency: 'INR';
  /** True for a credit note; sign of `gross_paise` follows the document. */
  readonly is_credit_note: boolean;
  /** Set on recurring or instalment documents so duplicate detection can stand down. */
  readonly recurrence: 'monthly' | 'quarterly' | 'instalment' | null;
  readonly purchase_order_reference: string | null;
  readonly created_at: IsoTimestamp;
}

/** One line of the bank statement. Raw narration is preserved verbatim, always. */
export interface Payment {
  readonly id: PaymentId;
  readonly value_date: IsoDate;
  readonly amount_paise: Paise;
  readonly currency: 'INR';
  /** The bank narration exactly as received. Truncated, case-mangled, whatever it was. */
  readonly narration_raw: string;
  readonly narration_normalised: string;
  /** Reference token recovered from the narration, if any. */
  readonly reference_extracted: string | null;
  readonly vendor_name_extracted: string | null;
  readonly vendor_id: VendorId | null;
  readonly application_status: ApplicationStatus;
  readonly bank_transaction_id: string;
  readonly created_at: IsoTimestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidates and outcomes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A proposed pairing of one invoice with zero or more payments. Bulk settlement means a
 * candidate may carry dozens of payment ids; `residual_paise` is what is left unsettled.
 */
export interface MatchCandidate {
  readonly id: MatchCandidateId;
  readonly run_id: RunId;
  readonly invoice_id: InvoiceId;
  readonly payment_ids: readonly PaymentId[];
  readonly cardinality: CardinalityKind;
  readonly score: ScoreBreakdown;
  readonly evidence: EvidenceSet;
  readonly conflicts: readonly Conflict[];
  /** invoice gross minus the settled sum, in paise. Zero on a full settlement. */
  readonly residual_paise: Paise;
  readonly proposed_by: ProposalSource;
  /**
   * True once the deterministic scorer has re-scored this candidate on its own merits.
   * A candidate from `model_proposal` that has not been re-scored may not clear anything.
   */
  readonly reverified: boolean;
  readonly rank: number;
  readonly created_at: IsoTimestamp;
}

/** The per-invoice result of a run. Discriminated on `status`. */
export type MatchOutcome =
  | { readonly status: 'auto_cleared'; readonly candidate: MatchCandidate }
  | {
      readonly status: 'held';
      readonly holds: readonly Hold[];
      readonly candidates: readonly MatchCandidate[];
    }
  | {
      readonly status: 'unmatched';
      readonly conflicts: readonly Conflict[];
      readonly candidates: readonly MatchCandidate[];
    };

export type MatchStatus = MatchOutcome['status'];

/**
 * A row in the exception queue. THE QUEUE IS ORDERED BY `money_at_risk_paise` DESCENDING —
 * not by score, not by age. That is how AP staff actually work.
 */
export interface ExceptionCase {
  readonly case_id: CaseId;
  readonly run_id: RunId;
  readonly invoice_id: InvoiceId;
  readonly money_at_risk_paise: Paise;
  readonly holds: readonly Hold[];
  readonly held_since: IsoTimestamp;
  readonly age_days: Days;
  readonly blocks_accounting: boolean;
  readonly application_status: ApplicationStatus;
  readonly top_candidate: MatchCandidate | null;
  readonly decision: Decision | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────────────────────────

/** Who acts now. The routing output, not a status. */
export interface OwnerNext {
  readonly role: OwnerRole;
  /** A named individual or team where one is known. */
  readonly party: string | null;
}

/**
 * Every reviewer action. `reviewer` and `reason` are non-nullable: an unattributed or
 * unexplained decision is not representable.
 *
 * `resolution_path` is null only for actions that are not a routing choice (an
 * auto-release recorded by the system, for instance).
 */
export interface Decision {
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

/**
 * A tolerance change, recorded as a decision.
 *
 * In the incumbent ERP, widening a tolerance silently auto-releases matching holds and
 * nothing records that a judgement was made. Here the widening IS the record: what it was,
 * what it became, what it applied to, who did it, why, when, and exactly which holds it
 * released. This is the project's strongest original claim. Do not weaken it.
 */
export interface ToleranceChange {
  readonly id: ToleranceChangeId;
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly scope: ToleranceScope;
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly timestamp: IsoTimestamp;
  /** The holds this change released. Empty is legal; absent is not. */
  readonly affected_hold_ids: readonly HoldId[];
  readonly decision_id: DecisionId | null;
  readonly run_id: RunId | null;
}

/** True when a change loosens rather than tightens. Surfaced prominently in the audit view. */
export type ToleranceDirection = 'widened' | 'narrowed' | 'unchanged' | 'retyped';

// ─────────────────────────────────────────────────────────────────────────────
// Feedback rules
// ─────────────────────────────────────────────────────────────────────────────

export const FEEDBACK_RULE_KINDS = [
  'vendor_alias',
  'reference_pattern',
  'duplicate_exemption',
  'delta_attribution',
] as const;
export type FeedbackRuleKind = (typeof FEEDBACK_RULE_KINDS)[number];

export type FeedbackRuleBody =
  | {
      readonly kind: 'vendor_alias';
      readonly raw_value: string;
      readonly canonical_vendor_id: VendorId;
    }
  | {
      readonly kind: 'reference_pattern';
      readonly pattern: string;
      readonly canonical_form: string;
    }
  | {
      readonly kind: 'duplicate_exemption';
      readonly vendor_id: VendorId;
      readonly recurrence: 'monthly' | 'quarterly' | 'instalment';
    }
  | {
      readonly kind: 'delta_attribution';
      readonly vendor_id: VendorId | null;
      readonly cause: DeltaCause;
      readonly bound: Tolerance;
    };

/**
 * A persisted reviewer correction. These are FEEDBACK RULES, never "learning": a rule is
 * a row a named human wrote, readable and revocable, not a weight nobody can inspect.
 *
 * `learned_from_case_id` is the provenance column — the case whose review produced it.
 * A rerun is a DIFF between two runs over the same frozen input; run 1 is never mutated.
 */
export interface FeedbackRule {
  readonly id: FeedbackRuleId;
  readonly body: FeedbackRuleBody;
  readonly learned_from_case_id: CaseId;
  readonly created_by: ReviewerId;
  readonly created_at: IsoTimestamp;
  readonly reason: string;
  /** Rules are deactivated, never removed. There is no delete path in this system. */
  readonly active: boolean;
  readonly deactivated_by: ReviewerId | null;
  readonly deactivated_at: IsoTimestamp | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runs
// ─────────────────────────────────────────────────────────────────────────────

/** Operational totals for one run. Everything here is computable without the answer key. */
export interface RunTotals {
  readonly invoices_total: number;
  readonly payments_total: number;
  /** Rows decided without a human. */
  readonly decided_count: number;
  /** decided_count / invoices_total, in [0, 1]. Reported against the ~70% plateau. */
  readonly coverage: Ratio;
  readonly auto_cleared_count: number;
  readonly held_count: number;
  readonly human_required_count: number;
  readonly unmatched_count: number;
  readonly holds_by_type: Readonly<Record<HoldType, number>>;
  readonly conflicts_emitted: number;
  /** A held invoice with no conflict is a policy bug. This must be 0. */
  readonly held_invoices_without_conflict: number;
  readonly amount_invoiced_paise: Paise;
  readonly amount_auto_cleared_paise: Paise;
  readonly amount_held_paise: Paise;
}

export interface Run {
  readonly id: RunId;
  readonly kind: RunKind;
  readonly status: RunStatus;
  readonly started_at: IsoTimestamp;
  readonly finished_at: IsoTimestamp | null;
  readonly dataset_hash: Sha256;
  readonly thresholds_hash: Sha256;
  readonly engine_version: string;
  readonly scorer_version: string;
  /** Run creation is idempotent on this key. */
  readonly idempotency_key: string;
  /** Set on a rerun: the run this one is a diff against. Never a mutation of it. */
  readonly parent_run_id: RunId | null;
  readonly feedback_rule_ids: readonly FeedbackRuleId[];
  readonly totals: RunTotals | null;
}

/** A rerun is a diff between two runs over the same frozen input. */
export interface RunDiff {
  readonly base_run_id: RunId;
  readonly compare_run_id: RunId;
  readonly newly_decided: readonly InvoiceId[];
  readonly newly_held: readonly InvoiceId[];
  readonly hold_type_changed: readonly InvoiceId[];
  readonly coverage_delta: Ratio;
  readonly rupees_at_risk_delta_paise: Paise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eval totals. Extends the operational totals with the figures that require the answer
 * key, which only the harness holds.
 *
 * `false_clears` is an ABSOLUTE COUNT, never a rate: at 200 rows a rate rounds to nothing
 * and hides the one number we exist to publish. The rate is carried separately, because
 * the regression gate compares it, but the count is the headline.
 */
export interface EvalTotals extends RunTotals {
  /** Auto-clears whose payment set EXACTLY EQUALS truth. Set equality, not overlap. */
  readonly correct_auto_clears: number;
  /** Auto-clears whose set differs from truth, or where truth says no match exists. */
  readonly false_clears: number;
  /** false_clears / decided_count. Derived; the count is what is published. */
  readonly false_clear_rate: Ratio;
  /** Sum of invoice amounts on false clears. A judge feels rupees, not percentages. */
  readonly rupees_at_risk_paise: Paise;
  readonly match_precision: Ratio;
  readonly match_recall: Ratio;
  readonly conflicts_per_held_invoice: Ratio;
}

/** Declared versus realised mix, plus that stratum's own outcome figures. */
export interface StratumFigures {
  readonly declared_count: number;
  readonly realised_count: number;
  readonly decided_count: number;
  readonly coverage: Ratio;
  readonly false_clears: number;
  readonly rupees_at_risk_paise: Paise;
}

/** Per hold type, not aggregate. Aggregate-only reporting is what we criticise. */
export interface HoldTypeFigures {
  readonly expected_count: number;
  readonly applied_count: number;
  /** Held AND typed correctly. */
  readonly correct_count: number;
  readonly recall: Ratio;
  readonly precision: Ratio;
  readonly auto_released_count: number;
  readonly human_released_count: number;
}

export type StratificationMap = Readonly<Record<Stratum, StratumFigures>>;
export type PerHoldTypeMap = Readonly<Record<HoldType, HoldTypeFigures>>;

/** One evaluated dataset, carrying its own totals and its own disclosed mix. */
export interface EvalDatasetReport {
  readonly dataset: EvalDatasetName;
  readonly row_count: number;
  readonly dataset_hash: Sha256;
  readonly totals: EvalTotals;
  readonly stratification: StratificationMap;
  readonly per_hold_type: PerHoldTypeMap;
}

/**
 * A baseline run, reported beside ours. The strong baseline is not handicapped: a
 * strawman dies under one question.
 */
export interface BaselineReport {
  readonly name: 'naive_exact' | 'llm_only' | 'holdfast';
  readonly description: string;
  readonly totals: EvalTotals;
}

/**
 * eval/report.json.
 *
 * READ THIS BEFORE CHANGING A KEY: tools/check-regression.mjs reads this file
 * programmatically and hard-fails on a missing key. It requires exactly
 *   totals.decided_count, totals.coverage, totals.false_clears, totals.rupees_at_risk_paise
 * — dotted from the ROOT. The TOP-LEVEL `totals` IS THE GATE'S INPUT, and it is the
 * SELECTION set: the same figures as `selection.totals`, lifted so the gate needs no
 * knowledge of our two-dataset layout. `holdout.totals` is reported honestly beside it and
 * is NOT what the gate reads; a holdout number that disagrees with the selection number is
 * a finding to publish, not a failure to hide.
 *
 * The dataset hash and the frozen-at instant are top level because every published number
 * has to name the bytes it came from.
 */
export interface EvalReport {
  readonly schema_version: 1;
  /** sha256 over data/, from data/MANIFEST. */
  readonly dataset_hash: Sha256;
  /** When the dataset was frozen — not when this report was generated. */
  readonly frozen_at: IsoTimestamp;
  readonly generated_at: IsoTimestamp;
  readonly dataset_commit: string;
  readonly run_id: RunId;
  readonly thresholds_hash: Sha256;
  /** THE GATE READS THIS. Mirrors `selection.totals`. */
  readonly totals: EvalTotals;
  /** Mirrors `selection.stratification`. The mix is always disclosed. */
  readonly stratification: StratificationMap;
  /** Mirrors `selection.per_hold_type`. Per type, because aggregate hides the failure. */
  readonly per_hold_type: PerHoldTypeMap;
  readonly selection: EvalDatasetReport;
  readonly holdout: EvalDatasetReport;
  readonly baselines: readonly BaselineReport[];
  /** Floors from eval/thresholds.json, evaluated against `totals`. */
  readonly floors: readonly FloorResult[];
  /** Stated plainly, including where we did not clear a bar we set ourselves. */
  readonly notes: readonly string[];
}

export interface FloorResult {
  readonly id: string;
  readonly threshold: number;
  readonly observed: number;
  readonly met: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit journal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who did a thing. A model is an actor and is recorded as one — but a model actor can
 * only ever appear on a proposal event, never on a release or a clear.
 */
export type Actor =
  | { readonly kind: 'human'; readonly reviewer: ReviewerId }
  | { readonly kind: 'system'; readonly component: string }
  | {
      readonly kind: 'model';
      readonly model_id: string;
      readonly call_site: LlmCallSite;
    };

export type ActorKind = Actor['kind'];

export const AUDIT_EVENTS = [
  'invoice_ingested',
  'payment_ingested',
  'run_started',
  'run_completed',
  'candidate_scored',
  'hold_applied',
  'hold_released',
  'decision_recorded',
  'tolerance_changed',
  'feedback_rule_created',
  'feedback_rule_deactivated',
  'application_status_changed',
  'proposal_received',
  'proposal_discarded',
  'export_generated',
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/** What the entry is about. */
export type EntityRef =
  | { readonly entity: 'invoice'; readonly id: InvoiceId }
  | { readonly entity: 'payment'; readonly id: PaymentId }
  | { readonly entity: 'hold'; readonly id: HoldId }
  | { readonly entity: 'decision'; readonly id: DecisionId }
  | { readonly entity: 'tolerance_change'; readonly id: ToleranceChangeId }
  | { readonly entity: 'feedback_rule'; readonly id: FeedbackRuleId }
  | { readonly entity: 'match_candidate'; readonly id: MatchCandidateId }
  | { readonly entity: 'run'; readonly id: RunId };

/**
 * One append-only journal row.
 *
 * Append-only is enforced by GRANT in db/migrations, not by convention: UPDATE and DELETE
 * are revoked on the table and `pnpm migrate` asserts the revocation actually took effect.
 * `sequence` and `prev_hash` chain the rows so a gap is visible.
 */
export interface AuditEntry {
  readonly id: AuditEntryId;
  /** Monotonic per journal. Gaps are detectable. */
  readonly sequence: number;
  readonly occurred_at: IsoTimestamp;
  readonly recorded_at: IsoTimestamp;
  readonly actor: Actor;
  readonly event: AuditEvent;
  readonly entity: EntityRef;
  readonly run_id: RunId | null;
  readonly case_id: CaseId | null;
  /** Structured detail. Never a narrative paragraph. */
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
  readonly payload_hash: Sha256;
  readonly prev_hash: Sha256 | null;
}

/**
 * The evidence-of-review export. Auditors inspect evidence that a detective control was
 * performed: who prepared, who reviewed, that they were different people, when, and to
 * what level of precision. Call this "audit-ready logging" and nothing stronger.
 */
export interface ReviewEvidenceExport {
  readonly run_id: RunId;
  readonly generated_at: IsoTimestamp;
  readonly preparer: ReviewerId;
  readonly reviewer: ReviewerId;
  /** True when preparer and reviewer are different people. Reported either way. */
  readonly separation_of_duties: boolean;
  readonly exception_count: number;
  readonly decisions: readonly Decision[];
  readonly tolerance_changes: readonly ToleranceChange[];
  readonly entries: readonly AuditEntry[];
  readonly precision_of_review: Ratio;
}

// ─────────────────────────────────────────────────────────────────────────────
// The answer key (harness-side only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row of the answer key: the correct payment set for an invoice, or explicit null
 * where no match exists, plus the hold the row is expected to raise.
 *
 * Only eval/ may read the file these rows come from. The engine never sees it — that is
 * the firewall, and it is mechanically enforced by the forbidden gate.
 */
export interface TruthRow {
  readonly invoice_id: InvoiceId;
  /** Explicit null means NO match exists. An empty array would be ambiguous. */
  readonly payment_ids: readonly PaymentId[] | null;
  readonly expected_hold_type: HoldType | null;
  readonly stratum: Stratum;
  readonly dataset: EvalDatasetName;
  readonly note: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-level helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Every key of `T` whose value is `Paise`. Used to keep money columns BIGINT. */
export type MoneyKeys<T> = {
  [K in keyof T]-?: T[K] extends Paise | null ? K : never;
}[keyof T];

/** Narrow a union member by its discriminant. */
export type Discriminated<U, K extends keyof U, V extends U[K]> = U extends Record<K, V>
  ? U
  : never;

/** The `Evidence` member for a given field. */
export type EvidenceFor<F extends EvidenceField> = Discriminated<Evidence, 'field', F>;

/** A row as it comes back from pg: money as BIGINT text, timestamps as ISO strings. */
export type RowOf<T> = {
  readonly [K in keyof T]: T[K] extends Paise ? string : T[K] extends Paise | null ? string | null : T[K];
};

/** Deeply readonly. The contract objects are values, not mutable state. */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
