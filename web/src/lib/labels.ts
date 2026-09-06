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

export const CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  policy_violation: "Policy violation",
  low_confidence: "Low confidence",
  data_mismatch: "Data mismatch",
  threshold_breach: "Threshold breach",
  missing_evidence: "Missing evidence",
};

export const SIGNAL_STATUS_LABELS: Record<SignalStatus, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  unknown: "Context",
};

export const RESOLUTION_PATH_LABELS: Record<ResolutionPath, string> = {
  re_application: "Re-application",
  customer_outreach: "Customer outreach",
  internal_correction: "Internal correction",
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

export const STATUS_OPTIONS: Array<{ value: ExceptionStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
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
