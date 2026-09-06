// The operation catalogue, published at GET /api/meta.
//
// Destructive operations are annotated here and enforced in the handler: a POST that
// would release a hold, widen a tolerance into a release, or stand a feedback rule down
// answers 428 with a preview until it carries the approval header naming a human.
//
// There is no removal operation in this list, and there is no payment execution operation
// in this codebase.

export interface Operation {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly summary: string;
  readonly destructive: boolean;
  readonly requires?: readonly string[];
}

export const OPERATIONS: readonly Operation[] = [
  {
    method: 'GET',
    path: '/api/meta',
    summary:
      'Repository status, every contract enumeration, the hold policy table, the routing suggestions and this catalogue.',
    destructive: false,
  },
  {
    method: 'GET',
    path: '/api/runs',
    summary: 'Runs, newest first, each with its totals.',
    destructive: false,
  },
  {
    method: 'POST',
    path: '/api/runs',
    summary:
      'Opens a run. Idempotent on the Idempotency-Key header: the same key returns the run it already created.',
    destructive: false,
    requires: ['Idempotency-Key header or idempotency_key in the body'],
  },
  {
    method: 'GET',
    path: '/api/runs/{runId}',
    summary:
      'One run: totals, holds by type, the largest exceptions by money at risk, and the decision and tolerance-change counts.',
    destructive: false,
  },
  {
    method: 'GET',
    path: '/api/runs/{runId}/queue',
    summary:
      'The exception queue, ordered by money at risk descending, with each row already carrying its holds, top candidate, decision and routing suggestion.',
    destructive: false,
  },
  {
    method: 'GET',
    path: '/api/runs/{runId}/diff',
    summary:
      'A rerun as a diff against a base run: newly decided, newly held, hold type changed, and the coverage and money deltas.',
    destructive: false,
    requires: ['base query parameter naming the run to compare against'],
  },
  {
    method: 'GET',
    path: '/api/runs/{runId}/review-evidence',
    summary:
      'The evidence-of-review export: preparer, reviewer, whether they were different people, every decision, every tolerance change and the journal for the run.',
    destructive: false,
  },
  {
    method: 'GET',
    path: '/api/cases/{caseId}',
    summary:
      'The whole case in one call: document, vendor, typed holds with policy, ranked candidates with evidence and arithmetic, the bank lines, duplicate context, decisions, tolerance changes, feedback rules and the verified journal slice.',
    destructive: false,
  },
  {
    method: 'GET',
    path: '/api/cases/{caseId}/decisions',
    summary: 'Every decision recorded on the case, oldest first.',
    destructive: false,
  },
  {
    method: 'POST',
    path: '/api/cases/{caseId}/decisions',
    summary:
      'Records a reviewer decision: release_hold, route, escalate or record_application_status. Reviewer and reason are mandatory.',
    destructive: true,
    requires: [
      'X-Holdfast-Human-Approval header matching the body reviewer, for action=release_hold',
    ],
  },
  {
    method: 'GET',
    path: '/api/tolerance-changes',
    summary:
      'Every tolerance change, with the direction it moved, the scope it applied to, who made it, why, and the holds it released.',
    destructive: false,
  },
  {
    method: 'POST',
    path: '/api/tolerance-changes',
    summary:
      'Records a tolerance change as a decision. Reports the direction and the holds in scope; releases them only when asked to and approved.',
    destructive: true,
    requires: [
      'X-Holdfast-Human-Approval header matching the body reviewer, when release_affected_holds is true',
    ],
  },
  {
    method: 'GET',
    path: '/api/feedback-rules',
    summary: 'Persisted reviewer corrections, with the case each one came from.',
    destructive: false,
  },
  {
    method: 'POST',
    path: '/api/feedback-rules',
    summary: 'Creates a feedback rule and records the decision that created it.',
    destructive: false,
  },
  {
    method: 'POST',
    path: '/api/feedback-rules/{ruleId}/deactivation',
    summary:
      'Stands a rule down. The row stays and records who did it — there is no removal path in this system.',
    destructive: true,
    requires: ['X-Holdfast-Human-Approval header matching the body reviewer'],
  },
  {
    method: 'GET',
    path: '/api/audit',
    summary:
      'The journal, filterable by run, case, event or entity, returned with its hash chain re-verified over the slice.',
    destructive: false,
  },
];

export const ABSENT_BY_DESIGN: readonly string[] = [
  'No DELETE method on any route, and no removal operation of any kind. Holds are released, feedback rules are deactivated, the journal only grows.',
  'No payment execution. There is no endpoint, no client, no queue and no disabled flag for moving money.',
  'No field anywhere carrying a model’s own stated certainty. A proposal is re-scored by the same deterministic breakdown as any other candidate or it does not clear.',
];
