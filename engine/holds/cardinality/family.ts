// W05c — the cardinality family, as the registry expects it.
//
// One hold type: `cardinality_residual`. Policy for it lives in engine/holds/registry.ts
// and says `auto_releasable: false, blocks_accounting: false` — the invoice cannot be
// paid while the residual stands, accruals may still be posted, and a named human clears
// it. This family does not restate that policy and does not get to change it: the worker
// that raises a hold should not also be the one deciding it can be lifted without anyone
// looking. Raising is all that happens here.
//
// Every proposal carries at least one Conflict. `applyAll` throws on an empty array and
// it is right to: a hold with no conflict is an exception a reviewer cannot act on, and a
// hold that is silently dropped is an invoice that gets paid.

import type {
  Conflict,
  ConflictSeverity,
  FieldPath,
  HoldType,
} from '@/lib/types';
import type { HoldContext, HoldFamily, HoldProposal } from '@/engine/holds/registry';
import { analyse, type CardinalityAnalysis } from './analyse';
import { magnitude } from './paise';

const HOLD: HoldType = 'cardinality_residual';

const path = (value: string): FieldPath => value as FieldPath;

function conflict(
  code: Conflict['code'],
  field: string,
  clause: string,
  severity: ConflictSeverity
): Conflict {
  return { code, field_path: path(field), clause, severity };
}

/**
 * Does this analysis describe a residual THIS family owns?
 *
 * The gate is cardinality, not size. A single payment falling short of a single invoice
 * is an amount variance whatever the shortfall is, and it is not routed here however
 * tempting the arithmetic looks.
 */
function owned(a: CardinalityAnalysis): boolean {
  if (a.shape === 'not_applicable' || a.shape === 'one_to_one') return false;
  if (a.shape === 'one_to_many') return a.residual_paise > 0;

  switch (a.search.kind) {
    case 'partial':
      return a.search.chosen.length >= 2 && a.residual_paise > 0;
    case 'ambiguous':
      // A tie between two single payments is a contest over which line settled the
      // invoice — a duplicate-payment question, and a different family's hold. A tie in
      // which either side is a multi-line settlement is a cardinality question.
      return a.search.rivals.some((rival) => rival.length >= 2);
    case 'exhausted':
      return a.pool.length >= 2;
    default:
      return false;
  }
}

function conflictsFor(a: CardinalityAnalysis, ctx: HoldContext, severity: ConflictSeverity): Conflict[] {
  const out: Conflict[] = [
    conflict(
      'residual_unsettled',
      'invoice.gross_paise',
      'A residual remains after partial settlement.',
      severity
    ),
  ];

  if (a.search.kind === 'ambiguous') {
    out.push(
      conflict(
        'multiple_candidates_tied',
        'match_candidate.payment_ids',
        'More than one settlement reaches the same sum.',
        'material'
      )
    );
  }

  if (a.window_would_close || a.bulk_outside_window) {
    out.push(
      conflict(
        'date_outside_window',
        'payment.value_date',
        'A settling line falls outside the date window.',
        a.bulk_outside_window ? 'material' : 'advisory'
      )
    );
  }

  if (a.crossing_credit_notes.length > 0) {
    out.push(
      conflict(
        'credit_note_crosses_period',
        'invoice.is_credit_note',
        'A same-vendor credit note falls inside the window.',
        'advisory'
      )
    );
  }

  const cap = ctx.policy.amount_cap_paise;
  if (Number.isSafeInteger(cap) && cap > 0 && magnitude(a.residual_paise) >= cap) {
    out.push(
      conflict(
        'amount_over_cap',
        'invoice.gross_paise',
        'The residual is at or above the review cap.',
        'blocking'
      )
    );
  }

  return out;
}

function reasonFor(a: CardinalityAnalysis): string {
  const residual = String(a.residual_paise);
  const target = String(a.target_paise);

  if (a.shape === 'one_to_many') {
    const remittance = a.bulk_payment_id === null ? 'a bulk remittance' : String(a.bulk_payment_id);
    if (a.bulk_outside_window) {
      return (
        `${remittance} names this invoice among ${String(a.bulk_claimants.length)} documents but falls ` +
        `outside the date window, so none of it is applied here; ${residual} of ${target} paise unsettled`
      );
    }
    if (a.search.kind === 'ambiguous') {
      return (
        `${remittance} names ${String(a.bulk_claimants.length)} invoices and cannot fund all of them; ` +
        `${String(a.search.rivals.length)} allocations reach ${String(a.search.rivalSum)} paise, ` +
        `so none is applied and ${residual} of ${target} paise stands unsettled`
      );
    }
    if (a.search.kind === 'exhausted') {
      return (
        `${remittance} names ${String(a.bulk_claimants.length)} invoices; the bounded allocation search ` +
        `did not resolve within its budget, so ${residual} of ${target} paise stands unsettled`
      );
    }
    return (
      `${remittance} funds ${String(a.bulk_funded.length)} of the ${String(a.bulk_claimants.length)} invoices ` +
      `it names and does not fund this one; ${residual} of ${target} paise unsettled`
    );
  }

  if (a.search.kind === 'ambiguous') {
    return (
      `${String(a.pool.length)} statement lines are linked to this invoice and ` +
      `${String(a.search.rivals.length)} distinct subsets each settle ${String(a.search.rivalSum)} paise; ` +
      `no subset is applied and ${residual} of ${target} paise stands unsettled`
    );
  }
  if (a.search.kind === 'exhausted') {
    return (
      `${String(a.pool.length)} statement lines are linked to this invoice; the bounded subset-sum ` +
      `did not resolve within its budget, so ${residual} of ${target} paise stands unsettled`
    );
  }
  return (
    `${String(a.settled_by.length)} of ${String(a.pool.length)} linked statement lines settle ` +
    `${String(a.settled_paise)} of ${target} paise; ${residual} paise unsettled`
  );
}

/**
 * The exported family. `apply` is pure, deterministic and returns at most one proposal per
 * invoice: an exception queue that lists the same invoice twice for one cause is a queue
 * people stop trusting.
 */
export const cardinalityFamily: HoldFamily = {
  id: 'cardinality',
  handles: [HOLD],
  apply(ctx: HoldContext): readonly HoldProposal[] {
    const analysis = analyse(ctx);
    if (!owned(analysis)) return [];

    const cap = ctx.policy.amount_cap_paise;
    const overCap =
      Number.isSafeInteger(cap) && cap > 0 && magnitude(analysis.residual_paise) >= cap;
    const severity: ConflictSeverity = overCap ? 'blocking' : 'material';

    return [
      {
        invoice_id: analysis.invoice_id,
        type: HOLD,
        reason: reasonFor(analysis),
        severity,
        conflicts: conflictsFor(analysis, ctx, severity),
      },
    ];
  },
};
