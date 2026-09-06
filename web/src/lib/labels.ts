/**
 * Display labels for the frozen backend's enumerations, kept out of components.
 *
 * Every key here is a member of an enumeration the backend defines. Nothing in this file
 * names a category, status or severity the backend does not have, and no label describes a
 * model's certainty — the backend has no such field and neither does this console.
 */

import type {
  ApplicationStatus,
  AuditEvent,
  CardinalityKind,
  ConflictSeverity,
  DecisionAction,
  HoldType,
  OwnerRole,
  ProposalSource,
  ResolutionPath,
  RunKind,
  RunStatus,
  ToleranceDirection,
} from "@/lib/api";
import { HOLD_TYPES } from "@/lib/api";

/** The eleven typed holds. A held invoice cannot be paid. */
export const HOLD_TYPE_LABELS: Record<HoldType, string> = {
  matching: "Matching",
  price_variance: "Price variance",
  quantity_variance: "Quantity variance",
  tax_variance: "Tax variance",
  tax_amount_range: "Tax amount range",
  dist_variance: "Distribution variance",
  duplicate_candidate: "Duplicate candidate",
  no_reference: "No reference",
  cardinality_residual: "Cardinality residual",
  period_deferral: "Period deferral",
  credit_note_crossing: "Credit note crossing",
};

/** Conflict severity. The backend's three levels, not a four-level invention. */
export const SEVERITY_LABELS: Record<ConflictSeverity, string> = {
  advisory: "Advisory",
  material: "Material",
  blocking: "Blocking",
};

/** Four AR application states, deliberately never collapsed into two. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  unapplied: "Unapplied",
  on_account: "On account",
  unidentified: "Unidentified",
};

export const RESOLUTION_PATH_LABELS: Record<ResolutionPath, string> = {
  re_application: "Re-application",
  customer_outreach: "Customer outreach",
  internal_correction: "Internal correction",
};

export const OWNER_ROLE_LABELS: Record<OwnerRole, string> = {
  ap_clerk: "AP clerk",
  ap_manager: "AP manager",
  controller: "Controller",
  requisitioner: "Requisitioner",
  tax_team: "Tax team",
  treasury: "Treasury",
  vendor: "Vendor",
};

export const DECISION_ACTION_LABELS: Record<DecisionAction, string> = {
  apply_hold: "Hold applied",
  release_hold: "Hold released",
  change_tolerance: "Tolerance changed",
  route: "Routed",
  record_application_status: "Application status recorded",
  create_feedback_rule: "Feedback rule created",
  escalate: "Escalated",
};

export const CARDINALITY_LABELS: Record<CardinalityKind, string> = {
  one_to_one: "One to one",
  one_to_many: "One to many",
  many_to_one: "Many to one",
  many_to_many: "Many to many",
  partial: "Partial",
};

/** Where a candidate pairing came from. A model proposal is a nomination, never a verdict. */
export const PROPOSAL_SOURCE_LABELS: Record<ProposalSource, string> = {
  deterministic_exact: "Deterministic, exact",
  deterministic_fuzzy: "Deterministic, fuzzy",
  cardinality_search: "Cardinality search",
  feedback_rule: "Feedback rule",
  model_proposal: "Model proposal, re-scored",
};

export const RUN_KIND_LABELS: Record<RunKind, string> = {
  baseline: "Baseline",
  engine: "Engine",
  rerun: "Rerun",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export const TOLERANCE_DIRECTION_LABELS: Record<ToleranceDirection, string> = {
  widened: "Widened",
  narrowed: "Narrowed",
  unchanged: "Unchanged",
  retyped: "Retyped",
};

export const AUDIT_EVENT_LABELS: Record<AuditEvent, string> = {
  invoice_ingested: "Invoice ingested",
  payment_ingested: "Payment ingested",
  run_started: "Run started",
  run_completed: "Run completed",
  candidate_scored: "Candidate scored",
  hold_applied: "Hold applied",
  hold_released: "Hold released",
  decision_recorded: "Decision recorded",
  tolerance_changed: "Tolerance changed",
  feedback_rule_created: "Feedback rule created",
  feedback_rule_deactivated: "Feedback rule deactivated",
  application_status_changed: "Application status changed",
  proposal_received: "Proposal received",
  proposal_discarded: "Proposal discarded",
  export_generated: "Export generated",
};

/** The compared fields on a candidate. */
export const EVIDENCE_FIELD_LABELS: Record<
  "vendor" | "amount" | "date" | "reference",
  string
> = {
  amount: "Amount",
  reference: "Reference",
  vendor: "Vendor",
  date: "Date",
};

// ── select options ───────────────────────────────────────────────────────────

/** Filters the queue route actually supports. Nothing here is filtered in the browser. */
export const HOLD_TYPE_OPTIONS: Array<{ value: HoldType | "all"; label: string }> = [
  { value: "all", label: "All hold types" },
  ...HOLD_TYPES.map((type) => ({ value: type, label: HOLD_TYPE_LABELS[type] })),
];

export const ACCOUNTING_OPTIONS: Array<{ value: "all" | "true" | "false"; label: string }> = [
  { value: "all", label: "Accounting: any" },
  { value: "true", label: "Blocks accounting" },
  { value: "false", label: "Accounting permitted" },
];

export const DECIDED_OPTIONS: Array<{ value: "all" | "undecided"; label: string }> = [
  { value: "all", label: "Decided or not" },
  { value: "undecided", label: "Undecided only" },
];
