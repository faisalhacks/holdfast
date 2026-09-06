// GET /api/runs/{runId}/review-evidence — the evidence-of-review export.
//
// What an auditor inspects is evidence that a detective control was actually performed:
// who prepared, who reviewed, whether they were different people, when, and to what level
// of precision. This assembles exactly that and calls it audit-ready logging, which is
// what it is, and nothing stronger.
//
// preparer and reviewer may be given as query parameters. When they are not, they are
// derived from the journal — the reviewer who acted first and the reviewer who acted last
// — and if those are the same person the export says so plainly rather than hiding it.

import type { NextRequest } from 'next/server';
import type { Decision, ReviewerId, RunId } from '@/lib/types';
import { guard, notFound, ok } from '../../../_lib/http';
import { nowTimestamp } from '../../../_lib/ids';
import { verifyChain } from '../../../_lib/journal';
import { repository, repositoryLabel } from '../../../_lib/repo';
import { toleranceDirection } from '../../../_lib/tolerance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  readonly params: { readonly runId: string };
}

function firstReviewer(decisions: readonly Decision[]): ReviewerId | null {
  return decisions[0]?.reviewer ?? null;
}

function lastReviewer(decisions: readonly Decision[]): ReviewerId | null {
  const distinct = [...new Set(decisions.map((d) => String(d.reviewer)))];
  const last = distinct[distinct.length - 1];
  return last === undefined ? null : (last as ReviewerId);
}

export async function GET(request: NextRequest, context: Context) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const runId = context.params.runId as RunId;
    const url = new URL(request.url);

    const repo = await repository();
    const run = await repo.getRun(runId);
    if (run === null) throw notFound(`run "${runId}" is not in this repository`);

    const [decisions, toleranceChanges, entries, queue] = await Promise.all([
      repo.listDecisions({ run_id: runId, case_id: null }),
      repo.listToleranceChanges(runId),
      repo.listAuditEntries({
        run_id: runId,
        case_id: null,
        event: null,
        entity_id: null,
        after_sequence: null,
        limit: 5000,
      }),
      repo.listExceptionCases(runId, {
        hold_type: null,
        blocks_accounting: null,
        undecided_only: false,
        limit: 1000,
        offset: 0,
      }),
    ]);

    const preparerParam = url.searchParams.get('preparer');
    const reviewerParam = url.searchParams.get('reviewer');
    const preparer = (preparerParam as ReviewerId | null) ?? firstReviewer(decisions);
    const reviewer = (reviewerParam as ReviewerId | null) ?? lastReviewer(decisions);

    const exceptionCount = queue.total_matching;
    const decidedCases = new Set(decisions.map((d) => String(d.case_id))).size;

    return ok(label, {
      export: {
        run_id: runId,
        generated_at: nowTimestamp(),
        preparer,
        reviewer,
        separation_of_duties:
          preparer !== null && reviewer !== null && String(preparer) !== String(reviewer),
        exception_count: exceptionCount,
        decisions,
        tolerance_changes: toleranceChanges,
        entries,
        // The share of exception cases that carry a recorded decision. Derived, and
        // reported whatever it comes to.
        precision_of_review: exceptionCount === 0 ? 0 : decidedCases / exceptionCount,
      },
      definitions: {
        separation_of_duties:
          'true when the preparer and the reviewer are different named people; reported either way',
        precision_of_review:
          'exception cases carrying at least one recorded decision, divided by exception cases in the run',
      },
      chain: verifyChain(entries),
      tolerance_changes_detail: toleranceChanges.map((tc) => ({
        id: tc.id,
        direction: toleranceDirection(tc.from, tc.to),
        reviewer: tc.reviewer,
        reason: tc.reason,
        timestamp: tc.timestamp,
        affected_hold_ids: tc.affected_hold_ids,
        decision_id: tc.decision_id,
      })),
      note: 'audit-ready logging of who decided what, when, and why. No stronger claim is made.',
    });
  });
}
