// GET  /api/feedback-rules — persisted reviewer corrections
// POST /api/feedback-rules — write one, and record the decision that wrote it
//
// These are FEEDBACK RULES, never "learning". A rule is a row a named human wrote, with a
// reason and a citation to the case it came from: readable, arguable and revocable. It is
// not a weight nobody can inspect, and nothing in this system adjusts itself.
//
// A rule is never removed. POST /api/feedback-rules/{ruleId}/deactivation stands one down
// and the row stays, recording who did it and when.

import type { NextRequest } from 'next/server';
import type {
  CaseId,
  DecisionId,
  FeedbackRuleBody,
  FeedbackRuleId,
  ReviewerId,
} from '@/lib/types';
import { boolParam, badRequest, guard, notFound, ok, readJson } from '../_lib/http';
import { newId, nowTimestamp } from '../_lib/ids';
import { repository, repositoryLabel } from '../_lib/repo';
import { createFeedbackRuleSchema, issues } from '../_lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const url = new URL(request.url);
    const activeOnly = boolParam(url, 'active') === true;

    const repo = await repository();
    const rules = await repo.listFeedbackRules(activeOnly);

    return ok(label, {
      feedback_rules: rules,
      count: rules.length,
      active_count: rules.filter((r) => r.active).length,
      stood_down_count: rules.filter((r) => !r.active).length,
      note: 'a feedback rule is a row a named human wrote, citing the case it came from; rules are stood down, never removed',
    });
  });
}

export async function POST(request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const parsed = createFeedbackRuleSchema.safeParse(await readJson(request));
    if (!parsed.success) throw badRequest('invalid feedback rule', issues(parsed.error));
    const body = parsed.data;

    const repo = await repository();
    const bundle = await repo.getCaseBundle(body.learned_from_case_id as CaseId);
    if (bundle === null) {
      throw notFound(
        `case "${body.learned_from_case_id}" is not in this repository; a rule must cite the case it came from`,
      );
    }

    const createdBy = body.created_by as ReviewerId;
    const createdAt = nowTimestamp();
    const ruleId = newId<FeedbackRuleId>('fbr');
    const decisionId = newId<DecisionId>('dec');

    const rule = await repo.insertFeedbackRule({
      id: ruleId,
      // The validated body is structurally the contract union; the ids inside it are
      // branded scalars, which a plain string cannot claim without this crossing.
      body: body.body as unknown as FeedbackRuleBody,
      learned_from_case_id: body.learned_from_case_id as CaseId,
      created_by: createdBy,
      created_at: createdAt,
      reason: body.reason,
    });

    const decision = await repo.insertDecision({
      id: decisionId,
      run_id: bundle.exception.run_id,
      case_id: bundle.exception.case_id,
      invoice_id: bundle.invoice.id,
      action: 'create_feedback_rule',
      resolution_path: 'internal_correction',
      owner_next: { role: 'ap_clerk', party: null },
      reviewer: createdBy,
      reason: body.reason,
      timestamp: createdAt,
      hold_ids: bundle.holds.filter((h) => h.released_at === null).map((h) => h.id),
      tolerance_change_id: null,
    });

    const entries = await repo.appendAuditEntries([
      {
        occurred_at: createdAt,
        actor: { kind: 'human', reviewer: createdBy },
        event: 'feedback_rule_created',
        entity: { entity: 'feedback_rule', id: rule.id },
        run_id: bundle.exception.run_id,
        case_id: bundle.exception.case_id,
        detail: { kind: rule.body.kind, reason: body.reason, active: rule.active },
      },
      {
        occurred_at: createdAt,
        actor: { kind: 'human', reviewer: createdBy },
        event: 'decision_recorded',
        entity: { entity: 'decision', id: decision.id },
        run_id: decision.run_id,
        case_id: decision.case_id,
        detail: { action: decision.action, feedback_rule_id: String(rule.id) },
      },
    ]);

    return ok(
      label,
      {
        feedback_rule: rule,
        decision,
        journal_entries: entries,
        note: 'in force from the next run; run 1 is never rewritten',
      },
      { status: 201 },
    );
  });
}
