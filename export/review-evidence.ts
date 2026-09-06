/**
 * W10 — THE EVIDENCE-OF-REVIEW EXPORT. Audit-ready logging, and nothing stronger.
 *
 * A reconciliation is a detective control. What an auditor inspects is not the
 * reconciliation's output but evidence that the control was PERFORMED: who prepared it,
 * who reviewed it, that those were two different people, when each acted, the exception
 * log with its dispositions, and the level of precision the review was carried out at.
 * This module assembles exactly those five things as a first-class artifact.
 *
 * The phrase for it is "audit-ready logging". It is not a claim of certification, of
 * readiness for any named framework, or of anything having been assessed by anybody. It is
 * a claim that the log contains what an auditor would ask to see, which is a claim we can
 * put on screen and defend line by line.
 *
 * ─── THE FIVE BLOCKS ─────────────────────────────────────────────────────────────────
 *
 *   identities   preparer, reviewer, separation between them, and every other named person
 *                who acted — because reducing a run five people worked to two names is a
 *                misrepresentation in the direction that flatters us. (./identity.ts)
 *   precision    the endpoint's ratio reused verbatim, plus the value-weighted ratio and
 *                the largest exception that passed with no recorded decision — the level of
 *                precision the control was actually performed at. (./precision.ts)
 *   exception_log  every exception case, its holds, its money at risk and its disposition.
 *   tolerance_change_evidence
 *                every tolerance change, its direction recomputed rather than believed, and
 *                its released set RECONCILED against `engine/rules`. This is the block that
 *                makes the strongest claim in the project checkable: the released set is
 *                recomputed from the rules and compared with what the change recorded, and a
 *                hold released under a change that does not govern it comes out as a finding.
 *   chain        every journal hash recomputed and every link re-walked. (./chain.ts)
 *
 * ─── WHAT THIS MODULE WILL NOT DO ────────────────────────────────────────────────────
 *
 * It does not read a clock. `generated_at` is supplied, for the same reason
 * `engine/run.ts` refuses the clock: two exports over one frozen run must not differ
 * because time passed between them.
 *
 * It does not read a repository, mutate a hold, or release anything. It is a pure function
 * of the rows it is handed, so the artifact can be regenerated from an archive years later
 * and come out byte-identical — which is the property that makes it evidence at all.
 *
 * It does not invent a name. When nobody acted, the identities come back null and
 * `attributable` is false; `asContractExport` then returns null rather than minting a
 * `ReviewEvidenceExport`, because the frozen contract requires two named people and a
 * placeholder in that field would be the worst thing this file could produce.
 */

import { assessToleranceChange, reconcileRelease, scopeBreadth } from '@/engine/rules';
import {
  describeDirection,
  describeTolerance,
  digitsOf,
  toleranceDirection,
  type ReleaseReconciliation,
  type ToleranceChangeAssessment,
} from '@/engine/rules';
import type {
  ApplicationStatus,
  AuditEntry,
  CaseId,
  Days,
  Decision,
  DecisionAction,
  DecisionId,
  ExceptionCase,
  Hold,
  HoldId,
  HoldType,
  Invoice,
  InvoiceId,
  IsoTimestamp,
  OwnerRole,
  Ratio,
  ResolutionPath,
  ReviewEvidenceExport,
  ReviewerId,
  RunId,
  Tolerance,
  ToleranceChange,
  ToleranceChangeId,
  ToleranceDirection,
  ToleranceScope,
} from '@/lib/types';
import { verifyChain, type ChainReport } from './chain';
import { deriveIdentities, type ReviewIdentities } from './identity';
import { measurePrecision, type ReviewPrecision } from './precision';

export const ARTIFACT_NAME = 'holdfast.review-evidence';
export const ARTIFACT_VERSION = 1;

const ARTIFACT_NOTE =
  'Audit-ready logging: who prepared, who reviewed, whether they were different people, when each acted, the exception log, and the level of precision of the review. No stronger claim is made and none is intended.';

// ─────────────────────────────────────────────────────────────────────────────
// The exception log
// ─────────────────────────────────────────────────────────────────────────────

export interface DispositionRow {
  readonly decision_id: DecisionId;
  readonly action: DecisionAction;
  readonly resolution_path: ResolutionPath | null;
  readonly owner_next: OwnerRole;
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly timestamp: IsoTimestamp;
  readonly tolerance_change_id: ToleranceChangeId | null;
}

export interface ExceptionLogRow {
  readonly case_id: CaseId;
  readonly invoice_id: InvoiceId;
  readonly hold_ids: readonly HoldId[];
  readonly hold_types: readonly HoldType[];
  /** Exact decimal digits. Money never crosses as a float. */
  readonly money_at_risk_paise: string;
  readonly held_since: IsoTimestamp;
  readonly age_days: Days;
  readonly blocks_accounting: boolean;
  readonly application_status: ApplicationStatus;
  readonly reviewed: boolean;
  readonly dispositions: readonly DispositionRow[];
}

function disposition(decision: Decision): DispositionRow {
  return {
    decision_id: decision.id,
    action: decision.action,
    resolution_path: decision.resolution_path,
    owner_next: decision.owner_next.role,
    reviewer: decision.reviewer,
    reason: decision.reason,
    timestamp: decision.timestamp,
    tolerance_change_id: decision.tolerance_change_id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The tolerance-change block
// ─────────────────────────────────────────────────────────────────────────────

export interface ToleranceChangeEvidence {
  readonly tolerance_change_id: ToleranceChangeId;
  readonly decision_id: DecisionId | null;
  readonly reviewer: ReviewerId;
  readonly reason: string;
  readonly timestamp: IsoTimestamp;
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly from_description: string;
  readonly to_description: string;
  readonly scope: ToleranceScope;
  /** Recomputed here, never taken from the row. The reviewer does not describe their own edit. */
  readonly direction: ToleranceDirection;
  readonly direction_clause: string;
  readonly assessment: ToleranceChangeAssessment;
  readonly reconciliation: ReleaseReconciliation;
}

// ─────────────────────────────────────────────────────────────────────────────
// The document
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewEvidenceDocument {
  readonly artifact: typeof ARTIFACT_NAME;
  readonly artifact_version: typeof ARTIFACT_VERSION;
  readonly run_id: RunId;
  readonly generated_at: IsoTimestamp;

  /** The five contract fields, mirrored at the top so the artifact reads as the contract does. */
  readonly preparer: ReviewerId | null;
  readonly reviewer: ReviewerId | null;
  readonly separation_of_duties: boolean;
  readonly exception_count: number;
  readonly precision_of_review: Ratio;

  readonly identities: ReviewIdentities;
  readonly precision: ReviewPrecision;
  readonly exception_log: readonly ExceptionLogRow[];
  readonly decisions: readonly Decision[];
  readonly tolerance_changes: readonly ToleranceChange[];
  readonly tolerance_change_evidence: readonly ToleranceChangeEvidence[];
  /** True when no tolerance change released a hold it does not govern. */
  readonly tolerance_changes_reconcile: boolean;
  readonly widened_tolerance_count: number;
  readonly entries: readonly AuditEntry[];
  readonly chain: ChainReport;
  readonly note: string;
}

export interface ReviewEvidenceInput {
  readonly run_id: RunId;
  /** Supplied, never read from the clock. Two exports of one frozen run must agree. */
  readonly generated_at: IsoTimestamp;
  readonly cases: readonly ExceptionCase[];
  readonly decisions: readonly Decision[];
  readonly tolerance_changes: readonly ToleranceChange[];
  readonly entries: readonly AuditEntry[];
  /**
   * Every hold in the run. Defaults to the union of the holds carried on the cases, which
   * is enough for an open queue and NOT enough once holds have been released — a released
   * hold leaves the queue, and reconciling a tolerance change needs the row it released.
   * Pass the full list whenever you have it.
   */
  readonly holds?: readonly Hold[];
  /** Invoices behind those holds. Needed for vendor-scoped changes and for money figures. */
  readonly invoices?: readonly Invoice[];
  /** Override the derived identities. Supplied names are reported as supplied. */
  readonly preparer?: ReviewerId | null;
  readonly reviewer?: ReviewerId | null;
}

function holdsFromCases(cases: readonly ExceptionCase[]): readonly Hold[] {
  const byId = new Map<string, Hold>();
  for (const exception of cases) {
    for (const hold of exception.holds) byId.set(String(hold.id), hold);
  }
  return [...byId.values()];
}

/**
 * Widened first, then widest scope, then most recent. The audit view opens on the
 * loosenings, which is also what `tolerance_changes_widened_idx` in
 * `db/migrations/007_tolerance_changes.sql` exists to serve. Sorting by timestamp alone
 * would bury a global widening under a week of invoice-scoped tightenings.
 */
function orderEvidence(rows: readonly ToleranceChangeEvidence[]): readonly ToleranceChangeEvidence[] {
  return [...rows].sort((a, b) => {
    const aWide = a.direction === 'widened' ? 1 : 0;
    const bWide = b.direction === 'widened' ? 1 : 0;
    if (aWide !== bWide) return bWide - aWide;
    const breadth = scopeBreadth(b.scope) - scopeBreadth(a.scope);
    if (breadth !== 0) return breadth;
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
    return a.tolerance_change_id < b.tolerance_change_id ? -1 : 1;
  });
}

export function buildReviewEvidence(input: ReviewEvidenceInput): ReviewEvidenceDocument {
  const holds = input.holds ?? holdsFromCases(input.cases);
  const invoices = input.invoices ?? [];

  const identities = deriveIdentities({
    entries: input.entries,
    decisions: input.decisions,
    ...(input.preparer === undefined ? {} : { preparer: input.preparer }),
    ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
  });

  const precision = measurePrecision({
    cases: input.cases,
    decisions: input.decisions,
    preparer: identities.preparer,
  });

  const decisionsByCase = new Map<string, Decision[]>();
  for (const decision of input.decisions) {
    const key = String(decision.case_id);
    decisionsByCase.set(key, [...(decisionsByCase.get(key) ?? []), decision]);
  }

  const exceptionLog: ExceptionLogRow[] = input.cases.map((exception) => {
    const recorded = decisionsByCase.get(String(exception.case_id)) ?? [];
    const dispositions = (recorded.length > 0
      ? recorded
      : exception.decision === null
        ? []
        : [exception.decision]
    ).map(disposition);
    return {
      case_id: exception.case_id,
      invoice_id: exception.invoice_id,
      hold_ids: exception.holds.map((hold) => hold.id),
      hold_types: exception.holds.map((hold) => hold.type),
      money_at_risk_paise: digitsOf(exception.money_at_risk_paise),
      held_since: exception.held_since,
      age_days: exception.age_days,
      blocks_accounting: exception.blocks_accounting,
      application_status: exception.application_status,
      reviewed: dispositions.length > 0,
      dispositions,
    };
  });

  const evidence: ToleranceChangeEvidence[] = input.tolerance_changes.map((change) => {
    const assessment = assessToleranceChange({
      from: change.from,
      to: change.to,
      scope: change.scope,
      holds,
      invoices,
    });
    return {
      tolerance_change_id: change.id,
      decision_id: change.decision_id,
      reviewer: change.reviewer,
      reason: change.reason,
      timestamp: change.timestamp,
      from: change.from,
      to: change.to,
      from_description: describeTolerance(change.from),
      to_description: describeTolerance(change.to),
      scope: change.scope,
      direction: toleranceDirection(change.from, change.to),
      direction_clause: describeDirection(toleranceDirection(change.from, change.to)),
      assessment,
      reconciliation: reconcileRelease(assessment, change.affected_hold_ids),
    };
  });

  const ordered = orderEvidence(evidence);

  return {
    artifact: ARTIFACT_NAME,
    artifact_version: ARTIFACT_VERSION,
    run_id: input.run_id,
    generated_at: input.generated_at,

    preparer: identities.preparer,
    reviewer: identities.reviewer,
    separation_of_duties: identities.separation_of_duties,
    exception_count: input.cases.length,
    precision_of_review: precision.precision_of_review,

    identities,
    precision,
    exception_log: exceptionLog,
    decisions: input.decisions,
    tolerance_changes: input.tolerance_changes,
    tolerance_change_evidence: ordered,
    tolerance_changes_reconcile: ordered.every((row) => row.reconciliation.reconciles),
    widened_tolerance_count: ordered.filter((row) => row.direction === 'widened').length,
    entries: input.entries,
    chain: verifyChain(input.entries),
    note: ARTIFACT_NOTE,
  };
}

/**
 * The document narrowed to the frozen `ReviewEvidenceExport` shape in `lib/types.ts`.
 *
 * Returns null when either identity is unknown. The contract declares `preparer` and
 * `reviewer` as non-nullable `ReviewerId`, and that is not an oversight: an evidence-of-
 * review export with nobody's name on it is not evidence of a review. The full document is
 * still available and still says what happened; what is refused is the specific act of
 * minting the contract type with a placeholder in a required field.
 */
export function asContractExport(
  document: ReviewEvidenceDocument,
): ReviewEvidenceExport | null {
  const { preparer, reviewer } = document;
  if (preparer === null || reviewer === null) return null;
  return {
    run_id: document.run_id,
    generated_at: document.generated_at,
    preparer,
    reviewer,
    separation_of_duties: document.separation_of_duties,
    exception_count: document.exception_count,
    decisions: document.decisions,
    tolerance_changes: document.tolerance_changes,
    entries: document.entries,
    precision_of_review: document.precision_of_review,
  };
}
