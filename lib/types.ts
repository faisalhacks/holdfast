// HOLDFAST — the type contract.
//
// Frozen the moment it lands. Every other worker imports from here and nothing here
// imports from anywhere else. Types and pure type-level helpers only: no runtime logic,
// no parsing, no validation. The only values are `as const` tables that name the closed
// vocabularies, so that a union and its runtime list can never drift apart.
//
// Three house rules are encoded structurally rather than left to convention:
//
//   1. Money is integer minor units. `Paise` is a branded `bigint`, stored `BIGINT`.
//      A float cannot be assigned to it and neither can a string. Rows come back from
//      `pg` as strings and must be parsed with `BigInt(...)`, never with the other one.
//
//   2. A hold is the domain object, not a match verdict. A released hold is a distinct
//      shape from an unreleased one — `HoldReleaseState` is a union, so "released with
//      no reason" and "unreleased but has a release timestamp" are unrepresentable.
//
//   3. A tolerance change is a decision. `ToleranceChange` carries a reviewer, a reason
//      and the holds it moved, all non-nullable. A silent widening has no shape here.

// ─── branding ──────────────────────────────────────────────────────────────────

declare const BRAND: unique symbol;

/** Nominal typing over a structural type. Purely type-level; erased at runtime. */
export type Brand<T, B extends string> = T & { readonly [BRAND]: B };

/**
 * Money. Integer minor units of INR, always. Stored `BIGINT`.
 * Never a float, never a string, never a fraction of a paisa.
 */
export type Paise = Brand<bigint, 'Paise'>;

/**
 * Money at a JSON boundary. `bigint` has no JSON representation, and
 * `tools/check-regression.mjs` `JSON.parse`s the eval report and compares the value
 * numerically. Integer paise still — the only difference is the carrier. Used ONLY in
 * `EvalReport`; every database column and every engine value uses `Paise`.
 */
export type PaiseJson = Brand<number, 'PaiseJson'>;

/** A real number in [0, 1]. Coverage, precision, recall, similarity, weights. */
export type Ratio = Brand<number, 'Ratio'>;

/** A deterministic component or composite score in [0, 1]. */
export type Score = Brand<number, 'Score'>;

/** A declared, fixed weight in [0, 1]. Weights are published, not tuned per row. */
export type Weight = Brand<number, 'Weight'>;

/** `YYYY-MM-DD`. */
export type IsoDate = Brand<string, 'IsoDate'>;

/** `YYYY-MM-DDTHH:MM:SS.sssZ`, always UTC. */
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;

/** `YYYY-MM`. The accounting period an invoice books into. */
export type AccountingPeriod = Brand<string, 'AccountingPeriod'>;

/** Lowercase sha256 hex. */
export type Sha256 = Brand<string, 'Sha256'>;

/** sha256 over the frozen dataset, as recorded in `data/MANIFEST`. */
export type DatasetHash = Sha256;

// ─── identifiers ───────────────────────────────────────────────────────────────

export type InvoiceId = Brand<string, 'InvoiceId'>;
export type PaymentId = Brand<string, 'PaymentId'>;
export type ApplicationId = Brand<string, 'ApplicationId'>;
export type HoldId = Brand<string, 'HoldId'>;
export type DecisionId = Brand<string, 'DecisionId'>;
export type ToleranceChangeId = Brand<string, 'ToleranceChangeId'>;
export type FeedbackRuleId = Brand<string, 'FeedbackRuleId'>;
export type RunId = Brand<string, 'RunId'>;
export type AuditEntryId = Brand<string, 'AuditEntryId'>;
export type VendorId = Brand<string, 'VendorId'>;

/** A named human. Not a role, not a service account — an accountable person. */
export type ReviewerId = Brand<string, 'ReviewerId'>;

/**
 * A reviewed exception, identified by the decision that closed it.
 * `FeedbackRule.learned_from_case_id` points at `decisions.id`: every persisted rule
 * traces back to one human judgement on one row.
 */
export type CaseId = DecisionId;

/**
 * The reserved actor recorded in `released_by` when a hold with
 * `auto_releasable: true` releases because its condition resolved. Every other release
 * must name a person. Holds with `auto_releasable: false` may never carry this value.
 */
export const AUTO_RELEASE_ACTOR = 'system:auto-release' as ReviewerId;

// ─── general type-level helpers ────────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [k: string]: JsonValue };
export type JsonObject = { readonly [k: string]: JsonValue };

/** Deep readonly. Records that have been written are not edited in place. */
export type Immutable<T> = T extends JsonPrimitive | bigint
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<Immutable<U>>
    : { readonly [K in keyof T]: Immutable<T[K]> };

/** Keys of `T` that do not mention certainty-about-itself. */
export type EvidenceBearingKeys<T> = {
  [K in keyof T]-?: K extends `${string}confidence${string}`
    ? never
    : K extends `${string}Confidence${string}`
      ? never
      : K;
}[keyof T];

/**
 * Resolves to `T` only if no key of `T` is a `*_confidence` field, and to `never`
 * otherwise. A score in this system is computed from field comparisons with published
 * weights; what a language model reports about its own certainty is not evidence and
 * has no field anywhere in this codebase. `check-forbidden.mjs` enforces the same rule
 * lexically; this makes the type system refuse it too.
 */
export type EvidenceOnly<T> = keyof T extends EvidenceBearingKeys<T> ? T : never;

/** Compile-time exhaustiveness marker for `switch` over a discriminated union. */
export type Exhaustive<T extends never> = T;

// ─── closed vocabularies ───────────────────────────────────────────────────────

/**
 * The eleven typed holds. A held invoice cannot be paid. Mirrors Oracle Payables:
 * validation applies typed holds rather than producing a single match verdict.
 * Closed on purpose — `engine/holds/registry.ts` is the only place a hold is wired in.
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
 * Four distinct states, per Oracle AR. `unapplied` means the counterparty is known and
 * the money is not yet against an invoice. `unidentified` means we do not know whose
 * money it is. Collapsing them loses the only two states a human can actually act on
 * differently, so they stay apart.
 */
export const APPLICATION_STATUSES = ['applied', 'unapplied', 'on_account', 'unidentified'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * What the reviewer actually chooses. There is no `approve` and no `reject` in this
 * system: an exception is routed to the party who can resolve it, and the route is the
 * decision.
 */
export const RESOLUTION_PATHS = ['re_application', 'customer_outreach', 'internal_correction'] as const;
export type ResolutionPath = (typeof RESOLUTION_PATHS)[number];

/**
 * What was done. `change_tolerance` is here rather than in configuration because
 * widening a tolerance is a judgement, recorded like any other.
 */
export const DECISION_ACTIONS = [
  'apply_hold',
  'release_hold',
  'change_tolerance',
  'reassign',
  'request_information',
  'record_feedback_rule',
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** Who acts next. `system` only where a hold is `auto_releasable`. */
export const OWNER_ROLES = ['ap_clerk', 'ap_supervisor', 'controller', 'requester', 'vendor', 'system'] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

/**
 * The comparable fields. `quantity` is present because `quantity_variance` is a
 * required hold type and its evidence has nowhere else to live; the four named in the
 * contract — vendor, amount, date, reference — are the first four.
 */
export const EVIDENCE_FIELDS = ['vendor', 'amount', 'date', 'reference', 'quantity'] as const;
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number];

/** Which document a side of a comparison was read from. */
export const EVIDENCE_SOURCES = [
  'invoice',
  'payment',
  'purchase_order',
  'receipt',
  'tax_line',
  'distribution',
  'remittance',
  'ledger',
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** `blocking` is the severity that forbids accounting entries while the hold is on. */
export const CONFLICT_SEVERITIES = ['info', 'warning', 'blocking'] as const;
export type ConflictSeverity = (typeof CONFLICT_SEVERITIES)[number];

export const TOLERANCE_UNITS = ['paise', 'percent', 'days', 'quantity'] as const;
export type ToleranceUnit = (typeof TOLERANCE_UNITS)[number];

/**
 * How a candidate application came to exist. An `llm_candidate` is a proposal and
 * nothing more: it re-enters the same deterministic scorer as every other candidate and
 * is discarded unless it clears on its own merits. No value of this type authorises a
 * hold release or a cleared state.
 */
export const PROPOSAL_SOURCES = [
  'exact_reference',
  'normalised_reference',
  'fuzzy_vendor_amount',
  'cardinality_subset',
  'feedback_rule',
  'llm_candidate',
] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

export const INVOICE_STATUSES = ['received', 'validated', 'on_hold', 'released', 'closed'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Integer paise means one currency. Multi-currency is a different product. */
export const CURRENCIES = ['INR'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const FEEDBACK_RULE_KINDS = ['vendor_alias', 'reference_normalisation', 'hold_disposition'] as const;
export type FeedbackRuleKind = (typeof FEEDBACK_RULE_KINDS)[number];

/** The two evaluation sets. See `EvalReport` for which one the CI gate reads. */
export const EVAL_DATASETS = ['selection', 'holdout'] as const;
export type EvalDatasetName = (typeof EVAL_DATASETS)[number];

/** Every append to `audit_journal` is one of these. Closed, so the journal is queryable. */
export const AUDIT_ACTIONS = [
  'invoice_ingested',
  'payment_ingested',
  'application_proposed',
  'application_status_changed',
  'hold_applied',
  'hold_released',
  'decision_recorded',
  'tolerance_changed',
  'feedback_rule_created',
  'feedback_rule_deactivated',
  'run_started',
  'run_finished',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ─── tolerance ─────────────────────────────────────────────────────────────────

/**
 * Open by construction: hold workers name their own tolerance keys
 * (`price_variance.percent`, `tax_variance.paise`, ...) and this file is frozen, so a
 * closed union here would make new holds unimplementable. Convention: `<hold>.<unit>`.
 */
export type ToleranceKey = Brand<string, 'ToleranceKey'>;

/** A limit, carrying its unit. Money limits are paise; nothing here is a float rupee. */
export type ToleranceValue =
  | { readonly unit: 'paise'; readonly value: Paise }
  | { readonly unit: 'percent'; readonly value: Ratio }
  | { readonly unit: 'days'; readonly value: number }
  | { readonly unit: 'quantity'; readonly value: number };

/** What a tolerance applies to. A change at a narrower scope is still a decision. */
export type ToleranceScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'vendor'; readonly vendor_id: VendorId }
  | { readonly kind: 'hold_type'; readonly hold_type: HoldType }
  | { readonly kind: 'invoice'; readonly invoice_id: InvoiceId };

/** The tolerance that was actually in force when a comparison was made. */
export interface AppliedTolerance {
  readonly key: ToleranceKey;
  readonly limit: ToleranceValue;
  readonly scope: ToleranceScope;
  /** The `tolerance_changes.id` in force, or null if the value is the published default. */
  readonly source_change_id: ToleranceChangeId | null;
}

/**
 * The project's strongest original claim, as a record rather than a config write.
 * In the incumbent ERP a widened tolerance silently auto-releases a matching hold and
 * nothing records that a judgement was made. Here the reviewer, the reason, the moment
 * and the holds it moved are all required.
 */
export interface ToleranceChange {
  readonly id: ToleranceChangeId;
  readonly key: ToleranceKey;
  readonly from: ToleranceValue;
  readonly to: ToleranceValue;
  readonly scope: ToleranceScope;
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly timestamp: IsoTimestamp;
  /** Holds re-evaluated because of this change. Empty is legal; absent is not. */
  readonly affected_hold_ids: readonly HoldId[];
}

// ─── evidence ──────────────────────────────────────────────────────────────────

export interface EvidenceSide<V> {
  readonly source: EvidenceSource;
  readonly value: V;
}

/**
 * Field-level and structured. There is deliberately no free-text member on any
 * evidence shape: a paragraph explaining why two things matched is not evidence, it is
 * an assertion. Both sides, the delta, the tolerance applied and whether the delta fell
 * inside it — that is the whole of it.
 */
export interface EvidenceBase<F extends EvidenceField, V> {
  readonly field: F;
  readonly left: EvidenceSide<V>;
  readonly right: EvidenceSide<V>;
  readonly tolerance: AppliedTolerance;
  readonly within_tolerance: boolean;
}

export interface AmountEvidence extends EvidenceBase<'amount', Paise> {
  /** right minus left, signed, in paise. */
  readonly delta_paise: Paise;
  /** |delta| / |left|, for reporting only; the decision is made on `delta_paise`. */
  readonly delta_ratio: number;
}

export interface DateEvidence extends EvidenceBase<'date', IsoDate> {
  /** right minus left, signed, in whole days. */
  readonly delta_days: number;
}

export interface VendorEvidence extends EvidenceBase<'vendor', string> {
  readonly normalised_left: string;
  readonly normalised_right: string;
  readonly similarity: Ratio;
}

export interface ReferenceEvidence extends EvidenceBase<'reference', string> {
  readonly normalised_left: string;
  readonly normalised_right: string;
  readonly similarity: Ratio;
}

export interface QuantityEvidence extends EvidenceBase<'quantity', number> {
  readonly delta_quantity: number;
  readonly unit_of_measure: string;
}

export type Evidence =
  | AmountEvidence
  | DateEvidence
  | VendorEvidence
  | ReferenceEvidence
  | QuantityEvidence;

// ─── conflict ──────────────────────────────────────────────────────────────────

/**
 * Open for the same reason as `ToleranceKey`: hold workers add codes and this file is
 * frozen. Convention: `UPPER_SNAKE`, stable, never reworded once emitted.
 */
export type ConflictCode = Brand<string, 'ConflictCode'>;

/** Dotted path into the record the conflict is about, e.g. `invoice.tax_amount_paise`. */
export type FieldPath = Brand<string, 'FieldPath'>;

/**
 * A short clause, not a narrative. `floors.conflicts_per_held_invoice_min` requires at
 * least one conflict per held invoice: a hold with an empty conflict array is a policy
 * bug and must fail loudly rather than render as a blank panel.
 */
export interface Conflict {
  readonly code: ConflictCode;
  readonly field_path: FieldPath;
  /** One clause. Not a sentence, not a paragraph, not an apology. */
  readonly clause: string;
  readonly severity: ConflictSeverity;
}

// ─── scoring ───────────────────────────────────────────────────────────────────

export interface ScoreComponent {
  /** Computed from the field comparison alone. */
  readonly score: Score;
  /** The published weight for this component. */
  readonly weight: Weight;
  /** score * weight. Carried so the composite can be audited without recomputation. */
  readonly contribution: Score;
}

/** Declared up front and published. Sums to 1. */
export interface ScoreWeights {
  readonly amount: Weight;
  readonly reference: Weight;
  readonly date: Weight;
  readonly vendor: Weight;
}

/**
 * Every number here is derived from a field comparison with a published weight. There
 * is no field for what a language model reports about its own certainty, in this type
 * or in any other — see `EvidenceOnly`, `check-forbidden.mjs` rule `model-confidence`,
 * and the assertion immediately below this declaration.
 */
export interface ScoreBreakdown {
  readonly amount: ScoreComponent;
  readonly reference: ScoreComponent;
  readonly date: ScoreComponent;
  readonly vendor: ScoreComponent;
  readonly weights: ScoreWeights;
  readonly composite: Score;
}

/** Compile-time proof that `ScoreBreakdown` carries no certainty-about-itself field. */
export type ScoreBreakdownIsEvidenceOnly = EvidenceOnly<ScoreBreakdown>;

// ─── ledger records ────────────────────────────────────────────────────────────

export interface Invoice {
  readonly id: InvoiceId;
  readonly vendor_id: VendorId;
  readonly vendor_name: string;
  readonly invoice_number: string;
  readonly invoice_date: IsoDate;
  readonly received_at: IsoTimestamp;
  readonly currency: CurrencyCode;
  readonly gross_amount_paise: Paise;
  readonly tax_amount_paise: Paise;
  readonly net_amount_paise: Paise;
  readonly po_number: string | null;
  readonly accounting_period: AccountingPeriod;
  readonly status: InvoiceStatus;
  readonly created_at: IsoTimestamp;
  readonly updated_at: IsoTimestamp;
}

export interface Payment {
  readonly id: PaymentId;
  /** Null exactly when `status` is `unidentified` — we do not know whose money it is. */
  readonly vendor_id: VendorId | null;
  readonly vendor_name: string | null;
  readonly payment_reference: string;
  readonly payment_date: IsoDate;
  readonly value_date: IsoDate;
  readonly currency: CurrencyCode;
  readonly amount_paise: Paise;
  /** The part not yet against an invoice. Zero when fully applied. */
  readonly unapplied_amount_paise: Paise;
  readonly remittance_text: string | null;
  readonly status: ApplicationStatus;
  readonly created_at: IsoTimestamp;
  readonly updated_at: IsoTimestamp;
}

/**
 * One payment against one invoice. The unit the scorer produces and the unit a reviewer
 * accepts or reroutes. A bulk payment settling forty invoices is forty rows here.
 */
export interface Application {
  readonly id: ApplicationId;
  readonly run_id: RunId;
  readonly payment_id: PaymentId;
  readonly invoice_id: InvoiceId;
  readonly status: ApplicationStatus;
  readonly applied_amount_paise: Paise;
  readonly proposed_by: ProposalSource;
  /**
   * True only after the deterministic scorer cleared this row on its own merits. An
   * `llm_candidate` reaches this field by the same path as every other candidate.
   */
  readonly verified: boolean;
  readonly score: ScoreBreakdown;
  readonly evidence: readonly Evidence[];
  readonly conflicts: readonly Conflict[];
  readonly created_at: IsoTimestamp;
}

// ─── holds ─────────────────────────────────────────────────────────────────────

/**
 * Released and unreleased are different shapes. "Released with no reason" and
 * "not released but stamped with a release time" cannot be constructed.
 */
export type HoldReleaseState =
  | {
      readonly released_by: null;
      readonly released_at: null;
      readonly release_reason: null;
    }
  | {
      /** A named human, or `AUTO_RELEASE_ACTOR` when `auto_releasable` is true. */
      readonly released_by: ReviewerId;
      readonly released_at: IsoTimestamp;
      readonly release_reason: string;
    };

export interface HoldCore {
  readonly id: HoldId;
  readonly invoice_id: InvoiceId;
  /** Set when the hold arose from a specific candidate application. */
  readonly application_id: ApplicationId | null;
  readonly run_id: RunId | null;
  readonly type: HoldType;
  /** Short and structured. The narrative, if anyone wants one, is the conflicts. */
  readonly reason: string;
  readonly applied_at: IsoTimestamp;
  /** True: the hold lifts when its condition resolves. False: a named human must lift it. */
  readonly auto_releasable: boolean;
  /** False: no accounting entries may be created for this invoice while the hold is on. */
  readonly blocks_accounting: boolean;
  readonly evidence: readonly Evidence[];
  /** At least one. A hold with no conflict is a policy bug, not an empty array. */
  readonly conflicts: readonly Conflict[];
}

/**
 * A held invoice cannot be paid. Some holds lift themselves when the condition
 * resolves; the rest need a named human and a reason. Each declares for itself whether
 * accounting entries may be created while it is on.
 */
export type Hold = HoldCore & HoldReleaseState;

// ─── decisions ─────────────────────────────────────────────────────────────────

export type DecisionSubject =
  | { readonly kind: 'invoice'; readonly invoice_id: InvoiceId }
  | { readonly kind: 'payment'; readonly payment_id: PaymentId }
  | { readonly kind: 'application'; readonly application_id: ApplicationId }
  | { readonly kind: 'hold'; readonly hold_id: HoldId };

/**
 * The reviewer's record. `resolution_path` is the real choice — where this goes and who
 * resolves it — and there is no approve/reject anywhere in the union.
 */
export interface Decision {
  readonly id: DecisionId;
  readonly run_id: RunId | null;
  readonly subject: DecisionSubject;
  readonly action: DecisionAction;
  readonly resolution_path: ResolutionPath;
  readonly owner_next: OwnerRole;
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly timestamp: IsoTimestamp;
  /** Set when `action` is `change_tolerance`. */
  readonly tolerance_change_id: ToleranceChangeId | null;
}

// ─── feedback rules ────────────────────────────────────────────────────────────

export type FeedbackRuleBody =
  | { readonly kind: 'vendor_alias'; readonly alias: string; readonly canonical_vendor_id: VendorId }
  | { readonly kind: 'reference_normalisation'; readonly pattern: string; readonly replacement: string }
  | { readonly kind: 'hold_disposition'; readonly hold_type: HoldType; readonly resolution_path: ResolutionPath };

/**
 * A persisted vendor mapping. These are feedback rules: a human made one judgement on
 * one row and chose to apply it again. Nothing here adapts on its own, and every rule
 * names the case it came from.
 */
export interface FeedbackRule {
  readonly id: FeedbackRuleId;
  readonly kind: FeedbackRuleKind;
  readonly body: FeedbackRuleBody;
  /** The decision that produced this rule. Never null: an unattributable rule is not one. */
  readonly learned_from_case_id: CaseId;
  readonly created_by: ReviewerId;
  readonly created_at: IsoTimestamp;
  /** Rules are deactivated, never removed. There is no delete path in this system. */
  readonly active: boolean;
  readonly deactivated_at: IsoTimestamp | null;
  readonly deactivated_by: ReviewerId | null;
}

// ─── runs ──────────────────────────────────────────────────────────────────────

/** Counted over the rows a run actually saw. Money is `Paise`; these map to `BIGINT`. */
export interface RunTotals {
  readonly invoices_seen: number;
  readonly payments_seen: number;
  readonly applications_proposed: number;
  readonly decided_count: number;
  readonly held_count: number;
  readonly coverage: Ratio;
  readonly amount_seen_paise: Paise;
  readonly amount_applied_paise: Paise;
  readonly amount_held_paise: Paise;
}

export interface Run {
  readonly id: RunId;
  readonly started_at: IsoTimestamp;
  readonly finished_at: IsoTimestamp | null;
  readonly status: RunStatus;
  readonly dataset_hash: DatasetHash;
  readonly thresholds_sha256: Sha256;
  readonly engine_version: string;
  readonly totals: RunTotals;
}

// ─── evaluation ────────────────────────────────────────────────────────────────

/**
 * The four keys `tools/check-regression.mjs` reads are `decided_count`, `coverage`,
 * `false_clears` and `rupees_at_risk_paise`. They are required, not optional, because
 * the gate treats a missing key as a contract failure rather than a skip.
 */
export interface EvalTotals {
  /** Rows the system decided rather than leaving to a human. */
  readonly decided_count: number;
  /** decided_count / row_count, in [0, 1]. Floor: `floors.coverage_min`. */
  readonly coverage: Ratio;
  /** ABSOLUTE COUNT, never a rate. Ceiling: `floors.false_clears_max`. */
  readonly false_clears: number;
  /** Paise exposed by those false clears. Ceiling: `floors.rupees_at_risk_max_paise`. */
  readonly rupees_at_risk_paise: PaiseJson;
  readonly row_count: number;
  readonly matched_count: number;
  readonly held_count: number;
  /** Floor: `floors.match_precision_min`. An unmatched item beats a wrong match. */
  readonly match_precision: Ratio;
  readonly match_recall: Ratio;
  /** Floor: `floors.conflicts_per_held_invoice_min`. */
  readonly conflicts_per_held_invoice: number;
}

/** Per hold type, never aggregated away. Floor: `floors.per_hold_type_recall_min`. */
export interface PerHoldTypeStats {
  readonly applied: number;
  readonly expected: number;
  readonly true_positives: number;
  readonly false_positives: number;
  readonly false_negatives: number;
  readonly precision: Ratio;
  readonly recall: Ratio;
}

/**
 * One stratum of the dataset — an amount band, a vendor-name-quality bucket, a
 * cardinality class. Keys are open so `eval/**` can name its own strata.
 */
export interface StratumStats {
  readonly row_count: number;
  readonly decided_count: number;
  readonly coverage: Ratio;
  readonly false_clears: number;
  readonly rupees_at_risk_paise: PaiseJson;
}

/** One evaluation set, carrying its own totals and its own breakdowns. */
export interface EvalDatasetReport {
  readonly name: EvalDatasetName;
  readonly row_count: number;
  readonly totals: EvalTotals;
  readonly stratification: Readonly<Record<string, StratumStats>>;
  readonly per_hold_type: Readonly<Record<HoldType, PerHoldTypeStats>>;
}

/**
 * `eval/report.json`.
 *
 * WHICH SET THE GATE READS: `tools/check-regression.mjs` digs `totals.decided_count`,
 * `totals.coverage`, `totals.false_clears` and `totals.rupees_at_risk_paise` — the
 * TOP-LEVEL `totals`, and nothing else. The top-level `totals`, `stratification` and
 * `per_hold_type` mirror the SELECTION set exactly, so CI gates on `selection`.
 *
 * `holdout` is computed, carried and published, and is deliberately NOT what CI reads.
 * A gate that fired on the holdout would make the holdout a selection set within two
 * merges, which is the failure mode the split exists to prevent. The holdout number is
 * the one we quote; the selection number is the one that stops a merge.
 */
export interface EvalReport {
  readonly schema_version: 1;
  readonly run_id: RunId;
  readonly generated_at: IsoTimestamp;
  /** sha256 of the frozen dataset, matching `data/MANIFEST`. */
  readonly dataset_hash: DatasetHash;
  /** When the dataset was frozen. After this the answer key cannot change. */
  readonly frozen_at: IsoTimestamp;
  readonly thresholds_sha256: Sha256;

  /** READ BY THE GATE. Mirrors `selection.totals`. */
  readonly totals: EvalTotals;
  /** Mirrors `selection.stratification`. */
  readonly stratification: Readonly<Record<string, StratumStats>>;
  /** Mirrors `selection.per_hold_type`. */
  readonly per_hold_type: Readonly<Record<HoldType, PerHoldTypeStats>>;

  readonly selection: EvalDatasetReport;
  readonly holdout: EvalDatasetReport;
}

// ─── audit journal ─────────────────────────────────────────────────────────────

export type AuditEntityRef =
  | { readonly kind: 'invoice'; readonly id: InvoiceId }
  | { readonly kind: 'payment'; readonly id: PaymentId }
  | { readonly kind: 'application'; readonly id: ApplicationId }
  | { readonly kind: 'hold'; readonly id: HoldId }
  | { readonly kind: 'decision'; readonly id: DecisionId }
  | { readonly kind: 'tolerance_change'; readonly id: ToleranceChangeId }
  | { readonly kind: 'feedback_rule'; readonly id: FeedbackRuleId }
  | { readonly kind: 'run'; readonly id: RunId };

/**
 * Append-only, and not by convention: `db/migrations/` revokes UPDATE and DELETE on the
 * table and `tools/migrate.mjs` asserts the revocation actually took effect against
 * `information_schema.role_table_grants`. `prev_hash`/`entry_hash` chain the rows so a
 * gap is detectable even by someone holding the database.
 */
export interface AuditEntry {
  readonly id: AuditEntryId;
  /** Monotonic within the journal. Assigned by the database, never by the caller. */
  readonly seq: number;
  readonly at: IsoTimestamp;
  /** Who. `AUTO_RELEASE_ACTOR` for auto-releases; a named human otherwise. */
  readonly actor: ReviewerId;
  readonly action: AuditAction;
  readonly entity: AuditEntityRef;
  readonly run_id: RunId | null;
  readonly before: JsonValue | null;
  readonly after: JsonValue | null;
  readonly reason: string | null;
  /** `entry_hash` of the previous row; null for the first. */
  readonly prev_hash: Sha256 | null;
  readonly entry_hash: Sha256;
}
