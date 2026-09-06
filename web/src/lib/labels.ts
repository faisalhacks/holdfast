/** Display labels for domain enums, kept out of components. */

import type {
  ExceptionCategory,
  ExceptionStatus,
  ResolutionPath,
  Severity,
  SignalStatus,
  TimelineEventKind,
} from "@/lib/api";

export const STATUS_LABELS: Record<ExceptionStatus, string> = {
  open: "Open",
  in_review: "In review",
  routed: "Routed",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * `low_confidence` is a contract enum value we cannot change, but the phrase
 * describes a model's opinion of itself, which is not evidence and is not
 * something this console reports. The wire value is untouched; the words a
 * reviewer reads name the deterministic condition instead.
 */
export const CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  policy_violation: "Policy violation",
  low_confidence: "Below threshold",
  data_mismatch: "Data mismatch",
  threshold_breach: "Threshold breach",
  missing_evidence: "Missing evidence",
};

export const SIGNAL_STATUS_LABELS: Record<SignalStatus, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  unknown: "No reference",
};

export const RESOLUTION_PATH_LABELS: Record<ResolutionPath, string> = {
  re_application: "Re-application",
  customer_outreach: "Customer outreach",
  internal_correction: "Internal correction",
};

/** One line on what each path asserts about the exception. */
export const RESOLUTION_PATH_HINTS: Record<ResolutionPath, string> = {
  re_application: "The settlement landed against the wrong item.",
  customer_outreach: "The counterparty has to supply what is missing.",
  internal_correction: "Our own record or posting is what is wrong.",
};

export const TIMELINE_KIND_LABELS: Record<TimelineEventKind, string> = {
  run: "Run",
  signal: "Signal",
  escalation: "Escalation",
  comment: "Comment",
  routing: "Routing",
  hold: "Hold",
  tolerance: "Tolerance",
};

/**
 * Whether an event came from the pipeline or from a person. Keyed off the
 * typed event kind rather than the free-text actor string, so the distinction
 * never depends on how a backend happens to spell a name.
 */
const HUMAN_KINDS: ReadonlySet<TimelineEventKind> = new Set<TimelineEventKind>([
  "routing",
  "hold",
  "tolerance",
  "comment",
]);

export function isHumanEvent(kind: TimelineEventKind): boolean {
  return HUMAN_KINDS.has(kind);
}

export const STATUS_OPTIONS: Array<{ value: ExceptionStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: STATUS_LABELS.open },
  { value: "in_review", label: STATUS_LABELS.in_review },
  { value: "routed", label: STATUS_LABELS.routed },
];

export const SEVERITY_OPTIONS: Array<{ value: Severity | "all"; label: string }> = [
  { value: "all", label: "All severities" },
  { value: "critical", label: SEVERITY_LABELS.critical },
  { value: "high", label: SEVERITY_LABELS.high },
  { value: "medium", label: SEVERITY_LABELS.medium },
  { value: "low", label: SEVERITY_LABELS.low },
];

export const CATEGORY_OPTIONS: Array<{ value: ExceptionCategory | "all"; label: string }> = [
  { value: "all", label: "All categories" },
  { value: "policy_violation", label: CATEGORY_LABELS.policy_violation },
  { value: "threshold_breach", label: CATEGORY_LABELS.threshold_breach },
  { value: "data_mismatch", label: CATEGORY_LABELS.data_mismatch },
  { value: "missing_evidence", label: CATEGORY_LABELS.missing_evidence },
  { value: "low_confidence", label: CATEGORY_LABELS.low_confidence },
];
