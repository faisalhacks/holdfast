// GET  /api/cases/{caseId}/decisions — every decision recorded on the case
// POST /api/cases/{caseId}/decisions — record one
//
// The question this route asks a reviewer is never "approve or reject". It is WHO SHOULD
// ACT: a resolution path and an owner. `reviewer` and `reason` are mandatory because an
// unattributed or unexplained decision is not representable in the contract.
//
// Releasing a hold is DESTRUCTIVE — a held invoice cannot be paid, and releasing the last
// hold on a document is what changes that. Without the approval header the route performs
// nothing and answers 428 with a preview of exactly what would happen; with it, the
// release is recorded against a named human with their reason, and journalled.
//
// Nothing here pays anything. Releasing a hold makes a document payable in some other
// system; there is no code in this one that moves money.

import type { NextRequest } from 'next/server';
import type {
  ApplicationStatus,
  CaseId,
  DecisionId,
  HoldId,
  PaymentId,
  ReviewerId,
} from '@/lib/types';
import {
  approvalRequired,
  approvedBy,
  badRequest,
  conflict,
  guard,
  notFound,
  ok,
  readJson,
  unprocessable,
} from '../../../_lib/http';
import { newId, nowTimestamp } from '../../../_lib/ids';
import { repository, repositoryLabel } from '../../../_lib/repo';
import type { AuditDraft } from '../../../_lib/repository';
import { issues, recordDecisionSchema } from '../../../_lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  readonly params: { readonly caseId: string };
}

const ELSEWHERE: Readonly<Record<string, string>> = {
  change_tolerance: 'POST /api/tolerance-changes',
  create_feedback_rule: 'POST /api/feedback-rules',
  apply_hold: 'the engine applies holds; this API records decisions about them',
};

export async function GET(_request: NextRequest, context: Context) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const caseId = context.params.caseId as CaseId;
    const repo = await repository();
    const bundle = await repo.getCaseBundle(caseId);
    if (bundle === null) throw notFound(`case "${caseId}" is not in this repository`);
    return ok(label, { case_id: caseId, decisions: bundle.decisions });
  });
}

export async function POST(request: NextRequest, context: Context) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const caseId = context.params.caseId as CaseId;
    const raw = await readJson(request);

    const requested =
      raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>)['action'] : null;
    if (typeof requested === 'string' && requested in ELSEWHERE) {
      throw unprocessable(
        `"${requested}" is not recorded here`,
        { record_it_at: ELSEWHERE[requested] },
      );
    }

    const parsed = recordDecisionSchema.safeParse(raw);
    if (!parsed.success) throw badRequest('invalid decision', issues(parsed.error));
    const body = parsed.data;

    const repo = await repository();
    const bundle = await repo.getCaseBundle(caseId);
    if (bundle === null) throw notFound(`case "${caseId}" is not in this repository`);

    const reviewer = body.reviewer as ReviewerId;
    const holdIds = body.hold_ids as HoldId[];
    const onThisCase = new Set(bundle.holds.map((h) => String(h.id)));
    const stray = holdIds.filter((id) => !onThisCase.has(String(id)));
    if (stray.length > 0) {
      throw unprocessable('those holds are not on this case', { hold_ids: stray });
    }

    const timestamp = nowTimestamp();
    const decisionId = newId<DecisionId>('dec');
    const journal: AuditDraft[] = [];
    let releasedHoldIds: readonly HoldId[] = [];
    let applicationStatus: ApplicationStatus | null = null;

    if (body.action === 'release_hold') {
      if (holdIds.length === 0) {
        throw unprocessable('release_hold must name the hold_ids being released');
      }
      const targets = bundle.holds.filter((h) => holdIds.some((id) => String(id) === String(h.id)));
      const already = targets.filter((h) => h.released_at !== null);
      if (already.length > 0) {
        throw conflict('those holds are already released; a release is never repeated', {
          hold_ids: already.map((h) => h.id),
        });
      }

      const openAfter = bundle.holds.filter(
        (h) => h.released_at === null && !holdIds.some((id) => String(id) === String(h.id)),
      );

      if (!approvedBy(request, reviewer)) {
        throw approvalRequired('release_hold', {
          case_id: caseId,
          invoice_id: bundle.invoice.id,
          holds_to_release: targets.map((h) => ({
            id: h.id,
            type: h.type,
            severity: h.severity,
            auto_releasable: h.auto_releasable,
            blocks_accounting: h.blocks_accounting,
            reason: h.reason,
            conflicts: h.conflicts,
          })),
          holds_still_open_afterwards: openAfter.map((h) => ({ id: h.id, type: h.type })),
          document_becomes_payable: openAfter.length === 0,
          invoice_gross_paise: bundle.invoice.gross_paise,
          money_at_risk_paise: bundle.exception.money_at_risk_paise,
          releases_a_hold_that_would_not_lift_on_its_own: targets.some(
            (h) => !h.auto_releasable,
          ),
        });
      }

      const released = await repo.releaseHolds({
        hold_ids: holdIds,
        reviewer,
        reason: body.reason,
        released_at: timestamp,
      });
      releasedHoldIds = released.map((h) => h.id);

      for (const hold of released) {
        journal.push({
          occurred_at: timestamp,
          actor: { kind: 'human', reviewer },
          event: 'hold_released',
          entity: { entity: 'hold', id: hold.id },
          run_id: bundle.exception.run_id,
          case_id: caseId,
          detail: {
            hold_type: hold.type,
            released_by: String(reviewer),
            reason: body.reason,
            auto_releasable: hold.auto_releasable,
          },
        });
      }
    }

    if (body.action === 'record_application_status') {
      if (body.application_status === undefined) {
        throw unprocessable(
          'record_application_status must carry application_status; applied, unapplied, on_account and unidentified are four different routing outcomes and are never collapsed',
        );
      }
      applicationStatus = await repo.recordApplicationStatus({
        case_id: caseId,
        payment_id: (body.payment_id ?? null) as PaymentId | null,
        status: body.application_status,
      });
      journal.push({
        occurred_at: timestamp,
        actor: { kind: 'human', reviewer },
        event: 'application_status_changed',
        entity:
          body.payment_id === undefined || body.payment_id === null
            ? { entity: 'invoice', id: bundle.invoice.id }
            : { entity: 'payment', id: body.payment_id as PaymentId },
        run_id: bundle.exception.run_id,
        case_id: caseId,
        detail: {
          from: bundle.exception.application_status,
          to: applicationStatus,
          reason: body.reason,
        },
      });
    }

    const decision = await repo.insertDecision({
      id: decisionId,
      run_id: bundle.exception.run_id,
      case_id: caseId,
      invoice_id: bundle.invoice.id,
      action: body.action,
      resolution_path: body.resolution_path,
      owner_next: body.owner_next,
      reviewer,
      reason: body.reason,
      timestamp,
      hold_ids: holdIds,
      tolerance_change_id: null,
    });

    journal.push({
      occurred_at: timestamp,
      actor: { kind: 'human', reviewer },
      event: 'decision_recorded',
      entity: { entity: 'decision', id: decision.id },
      run_id: decision.run_id,
      case_id: caseId,
      detail: {
        action: decision.action,
        resolution_path: decision.resolution_path,
        owner_role: decision.owner_next.role,
        owner_party: decision.owner_next.party,
        hold_count: decision.hold_ids.length,
      },
    });

    const entries = await repo.appendAuditEntries(journal);

    return ok(
      label,
      {
        decision,
        released_hold_ids: releasedHoldIds,
        application_status: applicationStatus,
        journal_entries: entries,
      },
      { status: 201 },
    );
  });
}
