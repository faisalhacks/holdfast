// POST /api/feedback-rules/{ruleId}/deactivation — stand a rule down.
//
// Deactivation, not removal. The row stays, and gains the name of the human who stood it
// down and the instant they did it. There is no delete path in this system and this route
// is the reason there does not need to be one.
//
// It is destructive in the sense that matters — it changes what future runs will do — so
// it requires the approval header naming the same human as the body.

import type { NextRequest } from 'next/server';
import type { FeedbackRuleId, ReviewerId } from '@/lib/types';
import {
  approvalRequired,
  approvedBy,
  badRequest,
  conflict,
  guard,
  notFound,
  ok,
  readJson,
} from '../../../_lib/http';
import { nowTimestamp } from '../../../_lib/ids';
import { repository, repositoryLabel } from '../../../_lib/repo';
import { deactivateFeedbackRuleSchema, issues } from '../../../_lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  readonly params: { readonly ruleId: string };
}

export async function POST(request: NextRequest, context: Context) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const ruleId = context.params.ruleId as FeedbackRuleId;
    const parsed = deactivateFeedbackRuleSchema.safeParse(await readJson(request));
    if (!parsed.success) throw badRequest('invalid deactivation request', issues(parsed.error));
    const body = parsed.data;

    const repo = await repository();
    const rule = await repo.getFeedbackRule(ruleId);
    if (rule === null) throw notFound(`feedback rule "${ruleId}" is not in this repository`);
    if (!rule.active) {
      throw conflict('this rule is already stood down', {
        deactivated_by: rule.deactivated_by,
        deactivated_at: rule.deactivated_at,
      });
    }

    const reviewer = body.reviewer as ReviewerId;
    if (!approvedBy(request, reviewer)) {
      throw approvalRequired('feedback_rule_deactivation', {
        feedback_rule_id: ruleId,
        kind: rule.body.kind,
        created_by: rule.created_by,
        learned_from_case_id: rule.learned_from_case_id,
        original_reason: rule.reason,
        effect: 'the rule stops applying to future runs; the row and its history remain',
      });
    }

    const at = nowTimestamp();
    const stoodDown = await repo.deactivateFeedbackRule(ruleId, reviewer, at);

    const entries = await repo.appendAuditEntries([
      {
        occurred_at: at,
        actor: { kind: 'human', reviewer },
        event: 'feedback_rule_deactivated',
        entity: { entity: 'feedback_rule', id: ruleId },
        run_id: null,
        case_id: stoodDown.learned_from_case_id,
        detail: {
          kind: stoodDown.body.kind,
          deactivated_by: String(reviewer),
          reason: body.reason,
        },
      },
    ]);

    return ok(label, {
      feedback_rule: stoodDown,
      journal_entries: entries,
      note: 'the row was kept and marked; nothing was removed',
    });
  });
}
