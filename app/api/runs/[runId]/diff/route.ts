// GET /api/runs/{runId}/diff?base={baseRunId} — a rerun as a difference.
//
// A rerun is a DIFF between two runs over the same frozen input. The base run is never
// mutated and this route never writes anything: it reads both outcome sets and reports
// what moved, per invoice, plus the coverage and money-at-risk deltas.
//
// If the two runs were computed over different dataset hashes the response says so
// prominently, because a diff across different inputs is not a diff worth reading.

import type { NextRequest } from 'next/server';
import type { HoldType, InvoiceId, RunId } from '@/lib/types';
import { badRequest, guard, notFound, ok } from '../../../_lib/http';
import { sumPaise } from '../../../_lib/money';
import { repository, repositoryLabel } from '../../../_lib/repo';
import type { OutcomeRow } from '../../../_lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  readonly params: { readonly runId: string };
}

function sameTypes(left: readonly HoldType[], right: readonly HoldType[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

export async function GET(request: NextRequest, context: Context) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const compareId = context.params.runId as RunId;
    const url = new URL(request.url);
    const baseParam = url.searchParams.get('base');

    const repo = await repository();
    const compareRun = await repo.getRun(compareId);
    if (compareRun === null) throw notFound(`run "${compareId}" is not in this repository`);

    const baseId = (baseParam ?? compareRun.parent_run_id) as RunId | null;
    if (baseId === null) {
      throw badRequest(
        'this run names no parent, so the run to compare against must be given as ?base=<runId>',
      );
    }
    const baseRun = await repo.getRun(baseId);
    if (baseRun === null) throw notFound(`base run "${baseId}" is not in this repository`);

    const [baseOutcomes, compareOutcomes] = await Promise.all([
      repo.listOutcomes(baseId),
      repo.listOutcomes(compareId),
    ]);

    const baseByInvoice = new Map<string, OutcomeRow>(
      baseOutcomes.map((o) => [String(o.invoice_id), o]),
    );

    const newlyDecided: InvoiceId[] = [];
    const newlyHeld: InvoiceId[] = [];
    const holdTypeChanged: InvoiceId[] = [];
    const rows: unknown[] = [];

    for (const compare of compareOutcomes) {
      const base = baseByInvoice.get(String(compare.invoice_id));
      if (base === undefined) continue;
      const decidedNow = compare.status === 'auto_cleared' && base.status !== 'auto_cleared';
      const heldNow = compare.status === 'held' && base.status !== 'held';
      const typesMoved =
        base.status === 'held' &&
        compare.status === 'held' &&
        !sameTypes(base.hold_types, compare.hold_types);

      if (decidedNow) newlyDecided.push(compare.invoice_id);
      if (heldNow) newlyHeld.push(compare.invoice_id);
      if (typesMoved) holdTypeChanged.push(compare.invoice_id);

      if (decidedNow || heldNow || typesMoved) {
        rows.push({
          invoice_id: compare.invoice_id,
          base_status: base.status,
          compare_status: compare.status,
          base_hold_types: base.hold_types,
          compare_hold_types: compare.hold_types,
          base_money_at_risk_paise: base.money_at_risk_paise,
          compare_money_at_risk_paise: compare.money_at_risk_paise,
          moved: decidedNow ? 'newly_decided' : heldNow ? 'newly_held' : 'hold_type_changed',
        });
      }
    }

    const baseRisk = sumPaise(baseOutcomes.map((o) => o.money_at_risk_paise));
    const compareRisk = sumPaise(compareOutcomes.map((o) => o.money_at_risk_paise));

    const baseCoverage = baseRun.totals?.coverage ?? 0;
    const compareCoverage = compareRun.totals?.coverage ?? 0;

    return ok(label, {
      diff: {
        base_run_id: baseId,
        compare_run_id: compareId,
        newly_decided: newlyDecided,
        newly_held: newlyHeld,
        hold_type_changed: holdTypeChanged,
        coverage_delta: compareCoverage - baseCoverage,
        rupees_at_risk_delta_paise: compareRisk - baseRisk,
      },
      comparable: String(baseRun.dataset_hash) === String(compareRun.dataset_hash),
      inputs: {
        base: {
          run_id: baseId,
          kind: baseRun.kind,
          dataset_hash: baseRun.dataset_hash,
          coverage: baseCoverage,
          money_at_risk_paise: baseRisk,
          feedback_rule_ids: baseRun.feedback_rule_ids,
        },
        compare: {
          run_id: compareId,
          kind: compareRun.kind,
          dataset_hash: compareRun.dataset_hash,
          coverage: compareCoverage,
          money_at_risk_paise: compareRisk,
          feedback_rule_ids: compareRun.feedback_rule_ids,
        },
      },
      changes: rows,
      note: 'the base run is read, never rewritten; a rerun is a difference, not a correction',
    });
  });
}
