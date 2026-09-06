// GET /api/runs/{runId} — the run screen, assembled.
//
// Totals, the hold mix by type with each type's policy attached, the exceptions carrying
// the most money, and how much reviewer activity the run has attracted. Every figure is
// folded out of rows; none of it is written down here.

import type { NextRequest } from 'next/server';
import type { CaseId, HoldType, RunId } from '@/lib/types';
import { guard, intParam, notFound, ok } from '../../_lib/http';
import { repository, repositoryLabel } from '../../_lib/repo';
import { suggestRouting } from '../../_lib/routing';
import { toleranceDirection } from '../../_lib/tolerance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  readonly params: { readonly runId: string };
}

export async function GET(request: NextRequest, context: Context) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const runId = context.params.runId as RunId;
    const url = new URL(request.url);
    const topCount = intParam(url, 'top', 5, 50);

    const repo = await repository();
    const run = await repo.getRun(runId);
    if (run === null) throw notFound(`run "${runId}" is not in this repository`);

    const [holds, policies, outcomes, decisions, toleranceChanges, queue] = await Promise.all([
      repo.listHolds(runId),
      repo.holdPolicies(),
      repo.listOutcomes(runId),
      repo.listDecisions({ run_id: runId, case_id: null }),
      repo.listToleranceChanges(runId),
      repo.listExceptionCases(runId, {
        hold_type: null,
        blocks_accounting: null,
        undecided_only: false,
        limit: topCount,
        offset: 0,
      }),
    ]);

    const policyByType = new Map(policies.map((p) => [p.type, p]));
    const byType = new Map<HoldType, { open: number; released: number }>();
    for (const hold of holds) {
      const entry = byType.get(hold.type) ?? { open: 0, released: 0 };
      if (hold.released_at === null) entry.open += 1;
      else entry.released += 1;
      byType.set(hold.type, entry);
    }

    const holdMix = [...byType.entries()]
      .map(([type, counts]) => ({
        hold_type: type,
        open_count: counts.open,
        released_count: counts.released,
        policy: policyByType.get(type) ?? null,
      }))
      .sort((a, b) => b.open_count - a.open_count);

    const openHoldCount = holds.filter((h) => h.released_at === null).length;
    const releasedHoldCount = holds.length - openHoldCount;
    const humanReleased = holds.filter(
      (h) => h.released_at !== null && h.released_by !== null,
    ).length;

    return ok(label, {
      run,
      totals: run.totals,
      outcome_mix: {
        auto_cleared: outcomes.filter((o) => o.status === 'auto_cleared').length,
        held: outcomes.filter((o) => o.status === 'held').length,
        unmatched: outcomes.filter((o) => o.status === 'unmatched').length,
      },
      holds: {
        open_count: openHoldCount,
        released_count: releasedHoldCount,
        released_by_a_named_human: humanReleased,
        by_type: holdMix,
      },
      exceptions: {
        open_case_count: queue.total_matching,
        money_at_risk_paise: queue.money_at_risk_total,
        largest_by_money_at_risk: queue.cases.map((c) => ({
          case_id: c.case_id as CaseId,
          invoice_id: c.invoice_id,
          money_at_risk_paise: c.money_at_risk_paise,
          age_days: c.age_days,
          blocks_accounting: c.blocks_accounting,
          application_status: c.application_status,
          hold_types: c.holds.map((h) => h.type),
          decided: c.decision !== null,
          suggested_next: suggestRouting(
            c.holds.filter((h) => h.released_at === null).map((h) => h.type),
          ),
        })),
      },
      reviewer_activity: {
        decision_count: decisions.length,
        distinct_reviewers: new Set(decisions.map((d) => String(d.reviewer))).size,
        tolerance_change_count: toleranceChanges.length,
        tolerance_changes: toleranceChanges.map((tc) => ({
          id: tc.id,
          direction: toleranceDirection(tc.from, tc.to),
          scope_kind: tc.scope.kind,
          reviewer: tc.reviewer,
          timestamp: tc.timestamp,
          released_hold_count: tc.affected_hold_ids.length,
        })),
      },
    });
  });
}
