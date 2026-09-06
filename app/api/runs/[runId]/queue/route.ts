// GET /api/runs/{runId}/queue — the exception queue.
//
// ORDERED BY money at risk, DESCENDING. Not by score, not by age, not by arrival. That is
// how AP staff actually work, and it is the ordering the contract mandates.
//
// Each row already carries what the list needs to be useful without a second request:
// the typed holds and their policy, the top candidate's arithmetic, whether accounting is
// blocked, whether anyone has decided yet, and who the hold policy suggests should act.
//
// Query parameters: hold_type, blocks_accounting, undecided_only, limit, offset.

import type { NextRequest } from 'next/server';
import { HOLD_TYPES } from '@/lib/types';
import type { RunId } from '@/lib/types';
import {
  boolParam,
  enumParam,
  guard,
  intParam,
  notFound,
  ok,
} from '../../../_lib/http';
import { repository, repositoryLabel } from '../../../_lib/repo';
import { suggestRouting } from '../../../_lib/routing';

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

    const query = {
      hold_type: enumParam(url, 'hold_type', HOLD_TYPES),
      blocks_accounting: boolParam(url, 'blocks_accounting'),
      undecided_only: boolParam(url, 'undecided_only') === true,
      limit: intParam(url, 'limit', 25, 200),
      offset: intParam(url, 'offset', 0, 100000),
    };

    const repo = await repository();
    const run = await repo.getRun(runId);
    if (run === null) throw notFound(`run "${runId}" is not in this repository`);

    const [page, policies] = await Promise.all([
      repo.listExceptionCases(runId, query),
      repo.holdPolicies(),
    ]);
    const policyByType = new Map(policies.map((p) => [p.type, p]));

    const rows = page.cases.map((c) => {
      const open = c.holds.filter((h) => h.released_at === null);
      const top = c.top_candidate;
      return {
        case_id: c.case_id,
        run_id: c.run_id,
        invoice_id: c.invoice_id,
        money_at_risk_paise: c.money_at_risk_paise,
        held_since: c.held_since,
        age_days: c.age_days,
        blocks_accounting: c.blocks_accounting,
        application_status: c.application_status,
        payable: open.length === 0,
        holds: c.holds.map((hold) => ({
          id: hold.id,
          type: hold.type,
          reason: hold.reason,
          severity: hold.severity,
          auto_releasable: hold.auto_releasable,
          blocks_accounting: hold.blocks_accounting,
          is_open: hold.released_at === null,
          released_by: hold.released_by,
          released_at: hold.released_at,
          release_reason: hold.release_reason,
          conflict_codes: hold.conflicts.map((conflict) => conflict.code),
          policy: policyByType.get(hold.type) ?? null,
        })),
        top_candidate:
          top === null
            ? null
            : {
                id: top.id,
                cardinality: top.cardinality,
                payment_count: top.payment_ids.length,
                composite: top.score.composite,
                scorer_version: top.score.scorer_version,
                residual_paise: top.residual_paise,
                proposed_by: top.proposed_by,
                reverified: top.reverified,
                conflict_codes: top.conflicts.map((conflict) => conflict.code),
              },
        decision: c.decision,
        suggested_next: suggestRouting(open.map((h) => h.type)),
      };
    });

    return ok(label, {
      run_id: runId,
      ordering: 'money_at_risk_paise DESC, then case_id',
      filter: query,
      page: {
        limit: query.limit,
        offset: query.offset,
        returned: rows.length,
        total_matching: page.total_matching,
        has_more: query.offset + rows.length < page.total_matching,
      },
      money_at_risk_total_paise: page.money_at_risk_total,
      cases: rows,
    });
  });
}
