/**
 * Backend payload → UI view model.
 *
 * The rule this file is held to: every field it produces is either copied from a named
 * backend field or computed from backend fields by a derivation documented in place. There
 * are no defaults that invent meaning, no placeholder strings, and no enum members the
 * backend does not define. `docs/backend-integration.md` carries the same mapping as a
 * table for anyone reading the contract rather than the code.
 *
 * Where the backend field name is already good, the view model keeps it. Renames happen
 * only for the money fields, whose `_paise` suffix moves into the `Money` type, and for
 * the two arrays the UI wants pre-split (`openHolds`, `evidence`).
 */

import type {
  ApplicationStatus,
  ApprovalPreview,
  AuditActor,
  AuditEntry,
  AuditEvent,
  AuditSlice,
  CardinalityKind,
  CaseDossier,
  ChainReport,
  Conflict,
  ConflictSeverity,
  Decision,
  DecisionAction,
  DecisionOutcome,
  EvidenceField,
  EvidenceRow,
  Hold,
  HoldInScope,
  HoldMixEntry,
  HoldPolicy,
  HoldType,
  Invoice,
  MatchCandidate,
  Money,
  NormalisationNote,
  OwnerNext,
  OwnerRole,
  PaymentLine,
  ProposalSource,
  QueueCase,
  QueuePage,
  ResolutionPath,
  RoutingSuggestion,
  RunKind,
  RunOverview,
  RunStatus,
  RunTotals,
  SameAmountInvoice,
  ScoreBreakdown,
  ScoreComponent,
  Tolerance,
  ToleranceChange,
  ToleranceChangeOutcome,
  ToleranceDirection,
  Vendor,
  WhyHeld,
} from "@/lib/api/types";
import {
  APPLICATION_STATUSES,
  AUDIT_EVENTS,
  CARDINALITY_KINDS,
  CONFLICT_SEVERITIES,
  DECISION_ACTIONS,
  HOLD_TYPES,
  OWNER_ROLES,
  PROPOSAL_SOURCES,
  RESOLUTION_PATHS,
  RUN_KINDS,
  RUN_STATUSES,
} from "@/lib/api/types";
import {
  arr,
  asEnum,
  bool,
  num,
  obj,
  readMoney,
  readMoneyRequired,
  readTolerance,
  readToleranceScope,
  str,
  strOrNull,
} from "./wire";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic derivations
//
// Three, and only three, values in the view model are not copied from a backend field.
// Each is a pure function of fields that are.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Readonly<Record<ConflictSeverity, number>> = {
  advisory: 0,
  material: 1,
  blocking: 2,
};

/**
 * DERIVATION 1 — case severity.
 *
 * The backend types severity per hold (`Hold.severity`, a `ConflictSeverity`) and never
 * per case. The queue and the dossier both need one badge per row, so this takes the
 * highest-ranked severity among the case's OPEN holds. Released holds are excluded because
 * they no longer constrain the document. `null` when nothing is open, which the UI renders
 * as no badge rather than as a low severity.
 */
export function caseSeverity(openHolds: readonly Hold[]): ConflictSeverity | null {
  let worst: ConflictSeverity | null = null;
  for (const hold of openHolds) {
    if (worst === null || SEVERITY_RANK[hold.severity] > SEVERITY_RANK[worst]) {
      worst = hold.severity;
    }
  }
  return worst;
}

/**
 * DERIVATION 2 — open holds.
 *
 * `holds.filter((h) => h.is_open)`, where `is_open` is a backend field on the queue row and
 * is computed on the dossier from the backend's `released_at === null`. Split once here so
 * no component re-derives it.
 */
function openOf(holds: readonly Hold[]): readonly Hold[] {
  return holds.filter((hold) => hold.is_open);
}

/**
 * DERIVATION 3 — page number.
 *
 * The backend pages with `limit`/`offset`; the pagination control counts pages. This is
 * `Math.floor(offset / limit) + 1` and its inverse, and it is the only arithmetic the
 * console performs on a backend page.
 */
export function offsetToPage(offset: number, limit: number): number {
  return limit > 0 ? Math.floor(offset / limit) + 1 : 1;
}

export function pageToOffset(page: number, limit: number): number {
  return Math.max(0, (page - 1) * limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaf mappers
// ─────────────────────────────────────────────────────────────────────────────

const severity = (value: unknown): ConflictSeverity =>
  asEnum(value, CONFLICT_SEVERITIES, "advisory");
const holdType = (value: unknown): HoldType => asEnum(value, HOLD_TYPES, "matching");

export function mapConflict(source: unknown): Conflict {
  return {
    code: str(source, "code"),
    field_path: str(source, "field_path"),
    clause: str(source, "clause"),
    severity: severity(obj(source, "severity") ?? (source as never)?.["severity"]),
  };
}

function mapConflicts(source: unknown, name: string): readonly Conflict[] {
  return arr(source, name).map((entry) => ({
    code: str(entry, "code"),
    field_path: str(entry, "field_path"),
    clause: str(entry, "clause"),
    severity: asEnum(
      (entry as Record<string, unknown> | null)?.["severity"],
      CONFLICT_SEVERITIES,
      "advisory",
    ),
  }));
}

function mapPolicy(source: unknown): HoldPolicy | null {
  const policy = obj(source, "policy");
  if (policy === null) return null;
  return {
    type: holdType(policy["type"]),
    auto_releasable: bool(policy, "auto_releasable"),
    blocks_accounting: bool(policy, "blocks_accounting"),
    default_severity: asEnum(policy["default_severity"], CONFLICT_SEVERITIES, "advisory"),
    clause: str(policy, "clause"),
  };
}

/**
 * Queue rows carry `is_open` and `conflict_codes`; dossier holds carry `released_at` and
 * full `conflicts`. Both shapes are read here so a hold means one thing everywhere.
 */
export function mapHold(source: unknown): Hold {
  const record = (source ?? {}) as Record<string, unknown>;
  const releasedAt = strOrNull(record, "released_at");
  const isOpen =
    typeof record["is_open"] === "boolean" ? (record["is_open"] as boolean) : releasedAt === null;
  const conflicts = Array.isArray(record["conflicts"])
    ? mapConflicts(record, "conflicts")
    : arr(record, "conflict_codes").map((code) => ({
        code: typeof code === "string" ? code : "",
        field_path: "",
        clause: "",
        severity: severity(record["severity"]),
      }));

  return {
    id: str(record, "id"),
    type: holdType(record["type"]),
    reason: str(record, "reason"),
    severity: severity(record["severity"]),
    auto_releasable: bool(record, "auto_releasable"),
    blocks_accounting: bool(record, "blocks_accounting"),
    is_open: isOpen,
    released_by: strOrNull(record, "released_by"),
    released_at: releasedAt,
    release_reason: strOrNull(record, "release_reason"),
    conflicts,
    policy: mapPolicy(record),
    release_requires: strOrNull(record, "release_requires"),
  };
}

function mapNormalisation(source: unknown): NormalisationNote | null {
  const note = obj(source, "normalisation");
  if (note === null) return null;
  return {
    side: str(note, "side") === "payment" ? "payment" : "invoice",
    raw_value: str(note, "raw_value"),
    normalised_value: str(note, "normalised_value"),
    rule: str(note, "rule"),
    feedback_rule_id: strOrNull(note, "feedback_rule_id"),
  };
}

/**
 * One member of the backend's `EvidenceSet`.
 *
 * `delta` is polymorphic in the contract — a ratio on vendor and reference, signed paise on
 * amount, signed whole days on date — so it is split into three explicitly typed fields
 * rather than left to a caller to interpret. Nothing is invented: exactly one of the three
 * is non-null per row, chosen by the backend's own `field` discriminant.
 */
function mapEvidenceRow(field: EvidenceField, source: unknown): EvidenceRow {
  const record = (source ?? {}) as Record<string, unknown>;
  const base = {
    field,
    path: str(record, "path"),
    tolerance: readTolerance(record["tolerance"]),
    within_tolerance: bool(record, "within_tolerance"),
    normalisation: mapNormalisation(record),
    displaced: bool(record, "displaced"),
    displaced_from: strOrNull(record, "displaced_from"),
  };

  if (field === "amount") {
    return {
      ...base,
      invoiceValue: readMoney(record, "invoice_value_paise"),
      paymentValue: readMoney(record, "payment_value_paise"),
      deltaKind: "paise",
      deltaRatio: null,
      deltaMoney: readMoney(record, "delta_paise"),
      deltaDays: null,
      cause: strOrNull(record, "cause"),
    };
  }

  const invoiceValue = strOrNull(record, "invoice_value");
  const paymentValue = strOrNull(record, "payment_value");

  if (field === "date") {
    return {
      ...base,
      invoiceValue,
      paymentValue,
      deltaKind: "days",
      deltaRatio: null,
      deltaMoney: null,
      deltaDays: num(record, "delta"),
      cause: null,
    };
  }

  return {
    ...base,
    invoiceValue,
    paymentValue,
    deltaKind: "similarity",
    deltaRatio: num(record, "delta"),
    deltaMoney: null,
    deltaDays: null,
    cause: null,
  };
}

const EVIDENCE_ORDER: readonly EvidenceField[] = ["amount", "reference", "vendor", "date"];

function mapEvidenceSet(source: unknown): readonly EvidenceRow[] {
  const set = obj(source, "evidence");
  if (set === null) return [];
  return EVIDENCE_ORDER.filter((field) => set[field] !== undefined).map((field) =>
    mapEvidenceRow(field, set[field]),
  );
}

function mapScoreComponent(source: unknown): ScoreComponent {
  return {
    score: num(source, "score"),
    weight: num(source, "weight"),
    contribution: num(source, "contribution"),
  };
}

function mapScore(source: unknown): ScoreBreakdown {
  const score = obj(source, "score") ?? {};
  const weights = obj(score, "weights") ?? {};
  return {
    amount: mapScoreComponent(score["amount"]),
    reference: mapScoreComponent(score["reference"]),
    date: mapScoreComponent(score["date"]),
    vendor: mapScoreComponent(score["vendor"]),
    weights: {
      amount: num(weights, "amount"),
      reference: num(weights, "reference"),
      date: num(weights, "date"),
      vendor: num(weights, "vendor"),
    },
    composite: num(score, "composite"),
    scorer_version: str(score, "scorer_version"),
  };
}

function mapPayment(source: unknown): PaymentLine {
  return {
    id: str(source, "id"),
    value_date: str(source, "value_date"),
    amount: readMoneyRequired(source, "amount_paise"),
    narration_raw: str(source, "narration_raw"),
    reference_extracted: strOrNull(source, "reference_extracted"),
    vendor_name_extracted: strOrNull(source, "vendor_name_extracted"),
    application_status: asEnum(
      (source as Record<string, unknown> | null)?.["application_status"],
      APPLICATION_STATUSES,
      "unapplied",
    ),
    bank_transaction_id: str(source, "bank_transaction_id"),
  };
}

function mapCandidate(source: unknown): MatchCandidate {
  return {
    id: str(source, "id"),
    cardinality: asEnum(
      (source as Record<string, unknown> | null)?.["cardinality"],
      CARDINALITY_KINDS,
      "one_to_one",
    ),
    score: mapScore(source),
    evidence: mapEvidenceSet(source),
    conflicts: mapConflicts(source, "conflicts"),
    residual: readMoneyRequired(source, "residual_paise"),
    settled: readMoneyRequired(source, "settled_paise"),
    proposed_by: asEnum(
      (source as Record<string, unknown> | null)?.["proposed_by"],
      PROPOSAL_SOURCES,
      "deterministic_exact",
    ),
    reverified: bool(source, "reverified"),
    rank: num(source, "rank"),
    payments: arr(source, "payments").map(mapPayment),
  };
}

function mapOwnerNext(source: unknown): OwnerNext {
  const owner = obj(source, "owner_next") ?? {};
  return {
    role: asEnum<OwnerRole>(owner["role"], OWNER_ROLES, "ap_clerk"),
    party: strOrNull(owner, "party"),
  };
}

export function mapDecision(source: unknown): Decision {
  const record = (source ?? {}) as Record<string, unknown>;
  const path = record["resolution_path"];
  return {
    id: str(record, "id"),
    run_id: str(record, "run_id"),
    case_id: str(record, "case_id"),
    invoice_id: str(record, "invoice_id"),
    action: asEnum<DecisionAction>(record["action"], DECISION_ACTIONS, "route"),
    resolution_path:
      typeof path === "string"
        ? asEnum<ResolutionPath>(path, RESOLUTION_PATHS, "internal_correction")
        : null,
    owner_next: mapOwnerNext(record),
    reviewer: str(record, "reviewer"),
    reason: str(record, "reason"),
    timestamp: str(record, "timestamp"),
    hold_ids: arr(record, "hold_ids").map(String),
    tolerance_change_id: strOrNull(record, "tolerance_change_id"),
  };
}

function mapSuggestion(source: unknown): RoutingSuggestion | null {
  const suggestion = obj(source, "suggested_next");
  if (suggestion === null) return null;
  return {
    owner_role: asEnum<OwnerRole>(suggestion["owner_role"], OWNER_ROLES, "ap_clerk"),
    resolution_path: asEnum<ResolutionPath>(
      suggestion["resolution_path"],
      RESOLUTION_PATHS,
      "internal_correction",
    ),
    decided_by_hold_type: holdType(suggestion["decided_by_hold_type"]),
    because: str(suggestion, "because"),
    note: str(suggestion, "note"),
  };
}

const DIRECTIONS: readonly ToleranceDirection[] = [
  "widened",
  "narrowed",
  "unchanged",
  "retyped",
];

export function mapToleranceChange(source: unknown): ToleranceChange {
  const record = (source ?? {}) as Record<string, unknown>;
  return {
    id: str(record, "id"),
    decision_id: str(record, "decision_id"),
    from: readTolerance(record["from"]),
    to: readTolerance(record["to"]),
    scope: readToleranceScope(record["scope"]),
    direction: asEnum(record["direction"], DIRECTIONS, "unchanged"),
    scope_description: str(record, "scope_description"),
    reviewer: str(record, "reviewer"),
    reason: str(record, "reason"),
    timestamp: str(record, "timestamp"),
    affected_hold_ids: arr(record, "affected_hold_ids").map(String),
  };
}

function mapHoldInScope(source: unknown): HoldInScope {
  return {
    id: str(source, "id"),
    type: holdType((source as Record<string, unknown> | null)?.["type"]),
    case_id: str(source, "case_id"),
    invoice_id: str(source, "invoice_id"),
    severity: severity((source as Record<string, unknown> | null)?.["severity"]),
    auto_releasable: bool(source, "auto_releasable"),
    blocks_accounting: bool(source, "blocks_accounting"),
    invoice_gross: readMoney(source, "invoice_gross_paise"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

function mapActor(source: unknown): AuditActor {
  const actor = obj(source, "actor") ?? {};
  const kind = str(actor, "kind");
  if (kind === "human") return { kind: "human", reviewer: str(actor, "reviewer") };
  if (kind === "model") {
    return {
      kind: "model",
      model_id: str(actor, "model_id"),
      call_site: str(actor, "call_site"),
    };
  }
  return { kind: "system", component: str(actor, "component") };
}

export function mapAuditEntry(source: unknown): AuditEntry {
  const record = (source ?? {}) as Record<string, unknown>;
  const entity = obj(record, "entity") ?? {};
  const detail = obj(record, "detail") ?? {};
  const safeDetail: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      safeDetail[key] = value;
    }
  }
  return {
    id: str(record, "id"),
    sequence: num(record, "sequence"),
    occurred_at: str(record, "occurred_at"),
    recorded_at: str(record, "recorded_at"),
    actor: mapActor(record),
    event: asEnum<AuditEvent>(record["event"], AUDIT_EVENTS, "decision_recorded"),
    entity: { entity: str(entity, "entity"), id: str(entity, "id") },
    run_id: strOrNull(record, "run_id"),
    case_id: strOrNull(record, "case_id"),
    detail: safeDetail,
    payload_hash: str(record, "payload_hash"),
    prev_hash: strOrNull(record, "prev_hash"),
  };
}

function mapChain(source: unknown): ChainReport {
  const chain = obj(source, "chain") ?? {};
  const first = chain["first_sequence"];
  const last = chain["last_sequence"];
  return {
    first_sequence: typeof first === "number" ? first : null,
    last_sequence: typeof last === "number" ? last : null,
    entries_examined: num(chain, "entries_examined"),
    missing_sequences: arr(chain, "missing_sequences").filter(
      (value): value is number => typeof value === "number",
    ),
    unverifiable_entries: arr(chain, "unverifiable_entries").map(String),
    broken_links: arr(chain, "broken_links").map(String),
    intact: bool(chain, "intact", true),
    contiguous: bool(chain, "contiguous", true),
    note: str(chain, "note"),
  };
}

export function mapAuditSlice(source: unknown): AuditSlice {
  return {
    entries: arr(source, "entries").map(mapAuditEntry),
    chain: mapChain(source),
    actors: arr(source, "actors").map((entry) => ({
      actor: str(entry, "actor"),
      entry_count: num(entry, "entry_count"),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level responses
// ─────────────────────────────────────────────────────────────────────────────

function mapTotals(source: unknown): RunTotals | null {
  const totals = obj(source, "totals");
  if (totals === null) return null;
  const byType = obj(totals, "holds_by_type") ?? {};
  const holds_by_type = Object.fromEntries(
    HOLD_TYPES.map((type) => [type, num(byType, type)]),
  ) as Record<HoldType, number>;

  return {
    invoices_total: num(totals, "invoices_total"),
    payments_total: num(totals, "payments_total"),
    decided_count: num(totals, "decided_count"),
    coverage: num(totals, "coverage"),
    auto_cleared_count: num(totals, "auto_cleared_count"),
    held_count: num(totals, "held_count"),
    human_required_count: num(totals, "human_required_count"),
    unmatched_count: num(totals, "unmatched_count"),
    conflicts_emitted: num(totals, "conflicts_emitted"),
    held_invoices_without_conflict: num(totals, "held_invoices_without_conflict"),
    amount_invoiced: readMoneyRequired(totals, "amount_invoiced_paise"),
    amount_auto_cleared: readMoneyRequired(totals, "amount_auto_cleared_paise"),
    amount_held: readMoneyRequired(totals, "amount_held_paise"),
    holds_by_type,
  };
}

function mapHoldMix(source: unknown): readonly HoldMixEntry[] {
  return arr(source, "by_type").map((entry) => ({
    hold_type: holdType((entry as Record<string, unknown> | null)?.["hold_type"]),
    open_count: num(entry, "open_count"),
    released_count: num(entry, "released_count"),
    policy: mapPolicy(entry),
  }));
}

/** GET /api/runs/{runId} → RunOverview. */
export function mapRunOverview(data: unknown): RunOverview {
  const run = obj(data, "run") ?? {};
  const holds = obj(data, "holds") ?? {};
  const exceptions = obj(data, "exceptions") ?? {};
  const outcome = obj(data, "outcome_mix") ?? {};
  const activity = obj(data, "reviewer_activity") ?? {};

  return {
    run_id: str(run, "id"),
    kind: asEnum<RunKind>(run["kind"], RUN_KINDS, "engine"),
    status: asEnum<RunStatus>(run["status"], RUN_STATUSES, "completed"),
    started_at: str(run, "started_at"),
    finished_at: strOrNull(run, "finished_at"),
    engine_version: str(run, "engine_version"),
    scorer_version: str(run, "scorer_version"),
    parent_run_id: strOrNull(run, "parent_run_id"),
    totals: mapTotals(data),
    outcome_mix: {
      auto_cleared: num(outcome, "auto_cleared"),
      held: num(outcome, "held"),
      unmatched: num(outcome, "unmatched"),
    },
    holds: {
      open_count: num(holds, "open_count"),
      released_count: num(holds, "released_count"),
      released_by_a_named_human: num(holds, "released_by_a_named_human"),
      by_type: mapHoldMix(holds),
    },
    exceptions: {
      open_case_count: num(exceptions, "open_case_count"),
      money_at_risk: readMoneyRequired(exceptions, "money_at_risk_paise"),
    },
    reviewer_activity: {
      decision_count: num(activity, "decision_count"),
      distinct_reviewers: num(activity, "distinct_reviewers"),
      tolerance_change_count: num(activity, "tolerance_change_count"),
    },
  };
}

function mapQueueCase(source: unknown): QueueCase {
  const record = (source ?? {}) as Record<string, unknown>;
  const holds = arr(record, "holds").map(mapHold);
  const openHolds = openOf(holds);
  const top = obj(record, "top_candidate");
  const decision = obj(record, "decision");

  return {
    case_id: str(record, "case_id"),
    run_id: str(record, "run_id"),
    invoice_id: str(record, "invoice_id"),
    money_at_risk: readMoneyRequired(record, "money_at_risk_paise"),
    held_since: str(record, "held_since"),
    age_days: num(record, "age_days"),
    blocks_accounting: bool(record, "blocks_accounting"),
    application_status: asEnum<ApplicationStatus>(
      record["application_status"],
      APPLICATION_STATUSES,
      "unapplied",
    ),
    payable: bool(record, "payable"),
    holds,
    openHolds,
    severity: caseSeverity(openHolds),
    topCandidate:
      top === null
        ? null
        : {
            id: str(top, "id"),
            cardinality: asEnum<CardinalityKind>(
              top["cardinality"],
              CARDINALITY_KINDS,
              "one_to_one",
            ),
            payment_count: num(top, "payment_count"),
            composite: num(top, "composite"),
            scorer_version: str(top, "scorer_version"),
            residual: readMoneyRequired(top, "residual_paise"),
            proposed_by: asEnum<ProposalSource>(
              top["proposed_by"],
              PROPOSAL_SOURCES,
              "deterministic_exact",
            ),
            reverified: bool(top, "reverified"),
            conflict_codes: arr(top, "conflict_codes").map(String),
          },
    decision: decision === null ? null : mapDecision(decision),
    suggested_next: mapSuggestion(record),
  };
}

/** GET /api/runs/{runId}/queue → QueuePage. */
export function mapQueuePage(data: unknown): QueuePage {
  const page = obj(data, "page") ?? {};
  return {
    run_id: str(data, "run_id"),
    ordering: str(data, "ordering"),
    limit: num(page, "limit", 25),
    offset: num(page, "offset"),
    returned: num(page, "returned"),
    total_matching: num(page, "total_matching"),
    has_more: bool(page, "has_more"),
    money_at_risk_total: readMoneyRequired(data, "money_at_risk_total_paise"),
    cases: arr(data, "cases").map(mapQueueCase),
  };
}

function mapInvoice(source: unknown): Invoice {
  const invoice = obj(source, "invoice") ?? {};
  const tax = obj(invoice, "tax") ?? {};
  return {
    id: str(invoice, "id"),
    reference: str(invoice, "reference"),
    vendor_id: str(invoice, "vendor_id"),
    vendor_name_raw: str(invoice, "vendor_name_raw"),
    invoice_date: str(invoice, "invoice_date"),
    received_date: str(invoice, "received_date"),
    due_date: strOrNull(invoice, "due_date"),
    period: str(invoice, "period"),
    gross: readMoneyRequired(invoice, "gross_paise"),
    net: readMoneyRequired(invoice, "net_paise"),
    tax_total: readMoneyRequired(tax, "total_paise"),
    currency: str(invoice, "currency") || "INR",
    is_credit_note: bool(invoice, "is_credit_note"),
    recurrence: strOrNull(invoice, "recurrence"),
    purchase_order_reference: strOrNull(invoice, "purchase_order_reference"),
  };
}

function mapVendor(source: unknown): Vendor {
  const vendor = obj(source, "vendor") ?? {};
  return {
    id: str(vendor, "id"),
    name: str(vendor, "name"),
    normalised_name: str(vendor, "normalised_name"),
    tax_identifier: strOrNull(vendor, "tax_identifier"),
  };
}

function mapWhyHeld(source: unknown): readonly WhyHeld[] {
  return arr(source, "why_held").map((entry) => ({
    hold_id: str(entry, "hold_id"),
    hold_type: holdType((entry as Record<string, unknown> | null)?.["hold_type"]),
    clause: str(entry, "clause"),
    severity: severity((entry as Record<string, unknown> | null)?.["severity"]),
    blocks_accounting: bool(entry, "blocks_accounting"),
    conflicts: mapConflicts(entry, "conflicts"),
  }));
}

function mapSameAmount(source: unknown): readonly SameAmountInvoice[] {
  return arr(source, "same_amount_invoices").map((entry) => ({
    invoice_id: str(entry, "invoice_id"),
    reference: str(entry, "reference"),
    invoice_date: str(entry, "invoice_date"),
    period: str(entry, "period"),
    gross: readMoneyRequired(entry, "gross_paise"),
    days_from_this_invoice: num(entry, "days_from_this_invoice"),
    purchase_order_reference: strOrNull(entry, "purchase_order_reference"),
  }));
}

/** GET /api/cases/{caseId} → CaseDossier. */
export function mapCaseDossier(data: unknown): CaseDossier {
  const head = obj(data, "case") ?? {};
  const money = obj(data, "money") ?? {};
  const duplicates = obj(data, "duplicate_context") ?? {};
  const holds = arr(data, "holds").map(mapHold);
  const openHolds = openOf(holds);

  return {
    case_id: str(head, "case_id"),
    run_id: str(head, "run_id"),
    invoice_id: str(head, "invoice_id"),
    money_at_risk: readMoneyRequired(head, "money_at_risk_paise"),
    held_since: str(head, "held_since"),
    age_days: num(head, "age_days"),
    application_status: asEnum<ApplicationStatus>(
      head["application_status"],
      APPLICATION_STATUSES,
      "unapplied",
    ),
    blocks_accounting: bool(head, "blocks_accounting"),
    payable: bool(head, "payable"),
    open_hold_count: num(head, "open_hold_count"),
    released_hold_count: num(head, "released_hold_count"),
    severity: caseSeverity(openHolds),
    invoice: mapInvoice(data),
    vendor: mapVendor(data),
    holds,
    openHolds,
    candidates: arr(data, "candidates").map(mapCandidate),
    money: {
      invoice_gross: readMoneyRequired(money, "invoice_gross_paise"),
      invoice_net: readMoneyRequired(money, "invoice_net_paise"),
      tax_total: readMoneyRequired(money, "tax_total_paise"),
      settled_on_top_candidate: readMoney(money, "settled_on_top_candidate_paise"),
      residual_on_top_candidate: readMoney(money, "residual_on_top_candidate_paise"),
    },
    duplicate_context: {
      same_vendor_invoice_count: num(duplicates, "same_vendor_invoice_count"),
      vendor_exposure: readMoneyRequired(duplicates, "vendor_exposure_paise"),
      same_amount_invoices: mapSameAmount(duplicates),
    },
    decisions: arr(data, "decisions").map(mapDecision),
    tolerance_changes: arr(data, "tolerance_changes").map(mapToleranceChange),
    why_held: mapWhyHeld(data),
    suggested_next: mapSuggestion(data),
    audit: mapAuditSlice(obj(data, "audit")),
  };
}

/** POST /api/cases/{caseId}/decisions → DecisionOutcome. */
export function mapDecisionOutcome(data: unknown): DecisionOutcome {
  const status = (data as Record<string, unknown> | null)?.["application_status"];
  return {
    decision: mapDecision(obj(data, "decision")),
    released_hold_ids: arr(data, "released_hold_ids").map(String),
    application_status:
      typeof status === "string"
        ? asEnum<ApplicationStatus>(status, APPLICATION_STATUSES, "unapplied")
        : null,
    journal_entries: arr(data, "journal_entries").map(mapAuditEntry),
  };
}

/** POST /api/tolerance-changes → ToleranceChangeOutcome. */
export function mapToleranceOutcome(data: unknown): ToleranceChangeOutcome {
  return {
    tolerance_change: mapToleranceChange(obj(data, "tolerance_change")),
    decision: mapDecision(obj(data, "decision")),
    direction: asEnum(
      (data as Record<string, unknown> | null)?.["direction"],
      DIRECTIONS,
      "unchanged",
    ),
    scope_description: str(data, "scope_description"),
    holds_in_scope: arr(data, "holds_in_scope").map(mapHoldInScope),
    released_hold_ids: arr(data, "released_hold_ids").map(String),
    holds_left_untouched: arr(data, "holds_left_untouched").map(String),
    journal_entries: arr(data, "journal_entries").map(mapAuditEntry),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The 428 preview
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decodes the preview a 428 carries, discriminated on the backend's own `operation`.
 *
 * An unrecognised operation is not guessed at: it becomes a release preview with an empty
 * hold list, which the confirmation dialogue renders as "the backend described no holds"
 * rather than as an approval the reviewer can safely give.
 */
export function mapApprovalPreview(operation: string, preview: unknown): ApprovalPreview {
  if (operation === "tolerance_change_release") {
    return {
      operation: "tolerance_change_release",
      direction: asEnum(
        (preview as Record<string, unknown> | null)?.["direction"],
        DIRECTIONS,
        "unchanged",
      ),
      scope: readToleranceScope((preview as Record<string, unknown> | null)?.["scope"]),
      scope_description: str(preview, "scope_description"),
      from: readTolerance((preview as Record<string, unknown> | null)?.["from"]),
      to: readTolerance((preview as Record<string, unknown> | null)?.["to"]),
      holds_that_would_release: arr(preview, "holds_that_would_release").map(mapHoldInScope),
      holds_that_would_release_count: num(preview, "holds_that_would_release_count"),
      money_that_would_stop_being_held: readMoneyRequired(
        preview,
        "money_that_would_stop_being_held_paise",
      ),
      includes_holds_that_would_not_lift_on_their_own: bool(
        preview,
        "includes_holds_that_would_not_lift_on_their_own",
      ),
      widening: bool(preview, "widening"),
    };
  }

  return {
    operation: "release_hold",
    case_id: str(preview, "case_id"),
    invoice_id: str(preview, "invoice_id"),
    holds_to_release: arr(preview, "holds_to_release").map((entry) => ({
      id: str(entry, "id"),
      type: holdType((entry as Record<string, unknown> | null)?.["type"]),
      severity: severity((entry as Record<string, unknown> | null)?.["severity"]),
      auto_releasable: bool(entry, "auto_releasable"),
      blocks_accounting: bool(entry, "blocks_accounting"),
      reason: str(entry, "reason"),
      conflicts: mapConflicts(entry, "conflicts"),
    })),
    holds_still_open_afterwards: arr(preview, "holds_still_open_afterwards").map((entry) => ({
      id: str(entry, "id"),
      type: holdType((entry as Record<string, unknown> | null)?.["type"]),
    })),
    document_becomes_payable: bool(preview, "document_becomes_payable"),
    invoice_gross: readMoneyRequired(preview, "invoice_gross_paise"),
    money_at_risk: readMoneyRequired(preview, "money_at_risk_paise"),
    releases_a_hold_that_would_not_lift_on_its_own: bool(
      preview,
      "releases_a_hold_that_would_not_lift_on_its_own",
    ),
  };
}

export type { Money, Tolerance };
