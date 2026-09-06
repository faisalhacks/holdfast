// GET  /api/tolerance-changes — every tolerance change, with the direction it moved
// POST /api/tolerance-changes — record one, as a decision
//
// This is the project's strongest original claim and this route is where it lives.
//
// In the incumbent ERP, widening a tolerance silently auto-releases the matching holds
// and nothing records that a judgement was made. Here the widening IS the record: what it
// was, what it became, what it applied to, who did it, why, when, and exactly which holds
// it released. The change and the decision are written together and name each other.
//
// The holds a change may touch are read from the TABLES — the open holds inside the
// declared scope whose type that kind of tolerance governs. No engine call, no re-run, no
// model: a released set that cannot be reconstructed from rows is not auditable.
//
// Releasing is destructive and needs a named human's approval header. Recording the change
// WITHOUT releasing is always allowed, and the response still lists what it did not touch.

import type { NextRequest } from 'next/server';
import { HOLD_TYPES } from '@/lib/types';
import type {
  CaseId,
  DecisionId,
  Hold,
  HoldId,
  Invoice,
  InvoiceId,
  ReviewerId,
  RunId,
  Tolerance,
  ToleranceChangeId,
  ToleranceDirection,
  ToleranceScope,
} from '@/lib/types';
import {
  approvalRequired,
  approvedBy,
  badRequest,
  enumParam,
  guard,
  notFound,
  ok,
  readJson,
} from '../_lib/http';
import { newId, nowTimestamp } from '../_lib/ids';
import { sumPaise } from '../_lib/money';
import { repository, repositoryLabel } from '../_lib/repo';
import type { AuditDraft } from '../_lib/repository';
import { TOLERANCE_GOVERNS } from '../_lib/routing';
import { issues, toleranceChangeSchema } from '../_lib/schemas';
import { describeScope, holdInScope, toleranceDirection } from '../_lib/tolerance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRECTIONS = ['widened', 'narrowed', 'unchanged', 'retyped'] as const;

export async function GET(request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const url = new URL(request.url);
    const runId = url.searchParams.get('run_id') as RunId | null;
    const direction = enumParam<ToleranceDirection>(url, 'direction', DIRECTIONS);

    const repo = await repository();
    const changes = await repo.listToleranceChanges(runId);

    const enriched = changes
      .map((change) => ({
        ...change,
        direction: toleranceDirection(change.from, change.to),
        scope_description: describeScope(change.scope),
        released_hold_count: change.affected_hold_ids.length,
      }))
      .filter((change) => (direction === null ? true : change.direction === direction));

    return ok(label, {
      tolerance_changes: enriched,
      count: enriched.length,
      widened_count: enriched.filter((c) => c.direction === 'widened').length,
      note: 'a tolerance change is a decision, not configuration; widening is recorded, never silent',
    });
  });
}

export async function POST(request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const parsed = toleranceChangeSchema.safeParse(await readJson(request));
    if (!parsed.success) throw badRequest('invalid tolerance change', issues(parsed.error));
    const body = parsed.data;

    const repo = await repository();
    const bundle = await repo.getCaseBundle(body.case_id as CaseId);
    if (bundle === null) throw notFound(`case "${body.case_id}" is not in this repository`);

    const runId = bundle.exception.run_id;
    const reviewer = body.reviewer as ReviewerId;

    // The validated body is structurally the contract's Tolerance and ToleranceScope; the
    // scalars inside them are branded, which a value parsed from JSON cannot claim on its
    // own. The crossing happens once, here, and the shape is what zod already proved.
    const from = body.from as unknown as Tolerance;
    const to = body.to as unknown as Tolerance;
    const scope = body.scope as unknown as ToleranceScope;

    const direction = toleranceDirection(from, to);

    // Which holds this change can reach: open, inside the declared scope, and of a type
    // this kind of tolerance actually governs.
    const governed = new Set(TOLERANCE_GOVERNS[to.kind] ?? HOLD_TYPES);
    const runHolds = await repo.listHolds(runId);
    const invoiceIds = [...new Set(runHolds.map((h) => h.invoice_id))] as InvoiceId[];
    const invoices = await repo.getInvoices(invoiceIds);
    const invoiceById = new Map<string, Invoice>(invoices.map((i) => [String(i.id), i]));
    const invoiceOf = (hold: Hold): Invoice | null =>
      invoiceById.get(String(hold.invoice_id)) ?? null;

    const inScope = runHolds.filter(
      (hold) =>
        hold.released_at === null &&
        governed.has(hold.type) &&
        holdInScope(hold, scope, invoiceOf),
    );

    const scopeSummary = inScope.map((hold) => ({
      id: hold.id,
      type: hold.type,
      case_id: hold.case_id,
      invoice_id: hold.invoice_id,
      severity: hold.severity,
      auto_releasable: hold.auto_releasable,
      blocks_accounting: hold.blocks_accounting,
      invoice_gross_paise: invoiceOf(hold)?.gross_paise ?? null,
    }));

    if (body.release_affected_holds && !approvedBy(request, reviewer)) {
      throw approvalRequired('tolerance_change_release', {
        direction,
        scope: scope,
        scope_description: describeScope(scope),
        from: from,
        to: to,
        holds_that_would_release: scopeSummary,
        holds_that_would_release_count: inScope.length,
        money_that_would_stop_being_held_paise: sumPaise(
          inScope.map((hold) => invoiceOf(hold)?.gross_paise ?? 0),
        ),
        includes_holds_that_would_not_lift_on_their_own: inScope.some(
          (hold) => !hold.auto_releasable,
        ),
        widening: direction === 'widened',
      });
    }

    const timestamp = nowTimestamp();
    const changeId = newId<ToleranceChangeId>('tch');
    const decisionId = newId<DecisionId>('dec');

    let releasedIds: readonly HoldId[] = [];
    const journal: AuditDraft[] = [];

    if (body.release_affected_holds && inScope.length > 0) {
      const released = await repo.releaseHolds({
        hold_ids: inScope.map((h) => h.id),
        reviewer,
        reason: `tolerance change ${changeId}: ${body.reason}`,
        released_at: timestamp,
      });
      releasedIds = released.map((h) => h.id);
      for (const hold of released) {
        journal.push({
          occurred_at: timestamp,
          actor: { kind: 'human', reviewer },
          event: 'hold_released',
          entity: { entity: 'hold', id: hold.id },
          run_id: runId,
          case_id: hold.case_id,
          detail: {
            hold_type: hold.type,
            released_by: String(reviewer),
            tolerance_change_id: String(changeId),
            direction,
          },
        });
      }
    }

    const change = await repo.insertToleranceChange({
      id: changeId,
      decision_id: decisionId,
      from: from,
      to: to,
      scope: scope,
      reviewer,
      reason: body.reason,
      timestamp,
      affected_hold_ids: releasedIds,
      run_id: runId,
    });

    const decision = await repo.insertDecision({
      id: decisionId,
      run_id: runId,
      case_id: bundle.exception.case_id,
      invoice_id: bundle.invoice.id,
      action: 'change_tolerance',
      resolution_path: 'internal_correction',
      owner_next: body.owner_next,
      reviewer,
      reason: body.reason,
      timestamp,
      hold_ids: releasedIds,
      tolerance_change_id: changeId,
    });

    journal.push({
      occurred_at: timestamp,
      actor: { kind: 'human', reviewer },
      event: 'tolerance_changed',
      entity: { entity: 'tolerance_change', id: changeId },
      run_id: runId,
      case_id: bundle.exception.case_id,
      detail: {
        direction,
        scope_kind: scope.kind,
        from_kind: from.kind,
        to_kind: to.kind,
        holds_in_scope: inScope.length,
        holds_released: releasedIds.length,
        reason: body.reason,
      },
    });

    journal.push({
      occurred_at: timestamp,
      actor: { kind: 'human', reviewer },
      event: 'decision_recorded',
      entity: { entity: 'decision', id: decision.id },
      run_id: runId,
      case_id: bundle.exception.case_id,
      detail: {
        action: decision.action,
        tolerance_change_id: String(changeId),
        owner_role: decision.owner_next.role,
      },
    });

    const entries = await repo.appendAuditEntries(journal);

    return ok(
      label,
      {
        tolerance_change: change,
        decision,
        direction,
        scope_description: describeScope(scope),
        holds_in_scope: scopeSummary,
        released_hold_ids: releasedIds,
        holds_left_untouched: body.release_affected_holds
          ? []
          : scopeSummary.map((h) => h.id),
        journal_entries: entries,
      },
      { status: 201 },
    );
  });
}
