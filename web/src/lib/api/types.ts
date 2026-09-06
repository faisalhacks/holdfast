/** Stable UI-domain contract. Transport mapping belongs in the adapters. */

export type ExceptionStatus = "open" | "in_review" | "routed";
export type Severity = "critical" | "high" | "medium" | "low";
export type ExceptionCategory =
  | "policy_violation"
  | "low_confidence"
  | "data_mismatch"
  | "threshold_breach"
  | "missing_evidence";
export type SignalStatus = "pass" | "warn" | "fail" | "unknown";
export type EvidenceKind = "document" | "extract" | "system_record" | "external_check";
export type TimelineEventKind =
  | "run"
  | "signal"
  | "escalation"
  | "comment"
  | "routing"
  | "hold"
  | "tolerance";

export type ResolutionPath =
  | "re_application"
  | "customer_outreach"
  | "internal_correction";

export interface EntityRef {
  type: string;
  id: string;
  label: string;
}

export interface ExceptionSummary {
  id: string;
  reference: string;
  title: string;
  status: ExceptionStatus;
  severity: Severity;
  category: ExceptionCategory;
  agent: string;
  workflow: string;
  runId: string;
  entity: EntityRef;
  exposure_paise: number | null;
  currency: string;
  raisedAt: string;
  slaDueAt: string;
  assignee: string | null;
}

export interface Signal {
  id: string;
  label: string;
  observed: EvidenceValue;
  expected: EvidenceValue | null;
  status: SignalStatus;
  source: string;
}

export type EvidenceValue =
  | { kind: "text"; value: string }
  | { kind: "money"; amount_paise: number; currency: string }
  | { kind: "integer"; value: number; unit: string | null }
  | { kind: "date"; value: string };

export interface EvidenceItem {
  id: string;
  label: string;
  kind: EvidenceKind;
  summary: string;
  capturedAt: string;
  sourceRef: string;
}

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  actor: string;
  at: string;
  title: string;
  detail: string | null;
}

export interface RoutingDecision {
  id: string;
  exceptionId: string;
  resolution_path: ResolutionPath;
  owner_next: string;
  reason: string;
  routedAt: string;
}

export interface Hold {
  id: string;
  status: "held" | "released";
  amount_paise: number | null;
  currency: string;
  reason: string;
  releasedAt: string | null;
  releaseReason: string | null;
}

export interface ToleranceContext {
  from: number;
  to: number;
  scope: string;
}

export interface ExceptionDetail extends ExceptionSummary {
  policy: { id: string; name: string; clause: string } | null;
  signals: Signal[];
  evidence: EvidenceItem[];
  timeline: TimelineEvent[];
  routingDecision: RoutingDecision | null;
  hold: Hold | null;
  tolerance: ToleranceContext | null;
}

export type ExceptionSort = "amount_desc";

export interface ExceptionQuery {
  status?: ExceptionStatus | "all";
  severity?: Severity | "all";
  category?: ExceptionCategory | "all";
  search?: string;
  sort?: ExceptionSort;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RunSummary {
  runId: string;
  open: number;
  inReview: number;
  routed: number;
  held: number;
  money_at_risk_paise: number;
  currency: string;
}

export interface RoutingDecisionInput {
  resolution_path: ResolutionPath;
  owner_next: string;
  reason: string;
}

export interface ReleaseHoldInput {
  reason: string;
}

export interface ChangeToleranceInput {
  from: number;
  to: number;
  scope: string;
  reason: string;
}

export interface AdapterNotice {
  level: "demo" | "info" | "warning";
  message: string;
}

export interface MutationResult<T> {
  data: T;
  notice?: AdapterNotice;
}

export interface RoutingDecisionOutcome {
  exception: ExceptionDetail;
  decision: RoutingDecision;
}

export interface ReleaseHoldOutcome {
  exception: ExceptionDetail;
  hold: Hold;
}

export interface ChangeToleranceOutcome {
  exception: ExceptionDetail;
  affected_hold_ids: string[];
}

export interface AdapterInfo {
  id: string;
  label: string;
  isMock: boolean;
  description: string;
}

export interface SyndicateApi {
  readonly info: AdapterInfo;
  getRunSummary(runId: string): Promise<RunSummary>;
  listRunExceptions(runId: string, query?: ExceptionQuery): Promise<Page<ExceptionSummary>>;
  getException(id: string): Promise<ExceptionDetail | null>;
  getExceptionTimeline(id: string): Promise<TimelineEvent[]>;
  routeException(
    id: string,
    input: RoutingDecisionInput,
  ): Promise<MutationResult<RoutingDecisionOutcome>>;
  releaseHold(
    exceptionId: string,
    holdId: string,
    input: ReleaseHoldInput,
  ): Promise<MutationResult<ReleaseHoldOutcome>>;
  changeTolerance(
    exceptionId: string,
    input: ChangeToleranceInput,
  ): Promise<MutationResult<ChangeToleranceOutcome>>;
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
