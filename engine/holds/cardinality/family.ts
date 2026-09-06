// W05c — the cardinality hold family.
//
// Exports one `HoldFamily` for `engine/holds/registry.ts` to wire in at the Wave 3 merge
// gate. The registry is frozen and this worker does not touch it; the wiring line is
// `import { cardinalityFamily } from './cardinality';`.
//
// ─── What this family raises, and what it does not ───────────────────────────────────
//
// One hold code: `cardinality_residual`. Registry policy for it is
// `auto_releasable: false, blocks_accounting: false` — the invoice cannot be paid while a
// residual stands, but accrual entries may still be created, and no residual clears itself
// because deciding what happened to the shortfall is a judgement a named human makes.
//
// `handles` lists that one code deliberately. Three families run over the same context and
// a family that reaches for a neighbour's code turns one mis-typed hold into two damaged
// precision figures. Where the evidence is a duplicate, a variance or a plain absence of
// candidates, this family returns nothing and lets the family that owns the code speak.
//
// ─── Every proposal carries a conflict ───────────────────────────────────────────────
//
// `applyAll()` throws on an empty conflict array, and correctly: a hold with no conflict is
// an invoice a reviewer cannot act on. Every branch below builds `residual_unsettled` first
// and adds to it, so the array is non-empty by construction rather than by inspection.

import type {
  Conflict,
  ConflictSeverity,
  FieldPath,
  Invoice,
  Payment,
} from '@/lib/types';
import type { HoldContext, HoldFamily, HoldProposal } from '@/engine/holds/registry';
import { findResidual, type ResidualCause, type ResidualFinding } from './settlement';

export const CARDINALITY_FAMILY_ID = 'cardinality';

const GROSS_PATH = 'invoice.gross_paise' as FieldPath;
const AMOUNT_PATH = 'payment.amount_paise' as FieldPath;
const VALUE_DATE_PATH = 'payment.value_date' as FieldPath;

/**
 * Short fixed clauses, one per cause. Not generated prose, and deliberately not a sentence
 * about what probably happened: a clause names the condition that fired and stops.
 */
const CAUSE_CLAUSE: Readonly<Record<ResidualCause, string>> = Object.freeze({
  partial_settlement: 'Anchored payments settle part of this invoice; a residual remains.',
  bulk_partial: 'A bulk remittance names this invoice but does not reconcile to the documents it names.',
  contested_settlement: 'More than one payment set fits this invoice; none is proven.',
  advice_outside_window: 'A remittance advice names this invoice from outside the date window.',
  pool_exceeds_bound: 'The candidate set exceeds the bounded search size; no settlement was proven.',
});

const SEVERITY_RANK: Readonly<Record<ConflictSeverity, number>> = Object.freeze({
  advisory: 0,
  material: 1,
  blocking: 2,
});

function highestSeverity(conflicts: readonly Conflict[]): ConflictSeverity {
  let worst: ConflictSeverity = 'material';
  for (const conflict of conflicts) {
    if ((SEVERITY_RANK[conflict.severity] ?? 0) > (SEVERITY_RANK[worst] ?? 0)) {
      worst = conflict.severity;
    }
  }
  return worst;
}

/**
 * The reason line. A fixed clause, then the two figures a reviewer needs before they can
 * do anything: what is still owed and what was proven applied. Both integer paise; there is
 * no rupee field anywhere in this system and there is no float on this path.
 */
function reasonFor(finding: ResidualFinding, gross: number): string {
  const clause = CAUSE_CLAUSE[finding.cause];
  return (
    `${clause} Residual ${finding.residual_paise} paise of ${gross}; ` +
    `settled ${finding.settled_paise} paise across ${finding.settling_payment_ids.length} line(s).`
  );
}

function conflictsFor(
  finding: ResidualFinding,
  invoice: Invoice,
  amountCapPaise: number,
): readonly Conflict[] {
  const conflicts: Conflict[] = [
    {
      code: 'residual_unsettled',
      field_path: GROSS_PATH,
      clause: CAUSE_CLAUSE[finding.cause],
      severity: 'material',
    },
  ];

  if (finding.contested) {
    conflicts.push({
      code: 'multiple_candidates_tied',
      field_path: AMOUNT_PATH,
      // The tie is the finding. Reported as blocking because a settling set chosen from
      // tied candidates is a confident wrong answer, which is worse than no answer.
      clause: 'Two or more settling sets fit to the paise; the settling set is not reported.',
      severity: 'blocking',
    });
  }

  if (finding.cause === 'advice_outside_window') {
    const days = finding.days_outside_window;
    conflicts.push({
      code: 'date_outside_window',
      field_path: VALUE_DATE_PATH,
      clause:
        days === null
          ? 'The advice falls outside the bounded date window.'
          : `The nearest advice sits ${days} days from the invoice date, outside the bounded window.`,
      severity: 'material',
    });
  }

  if (finding.cause === 'pool_exceeds_bound') {
    conflicts.push({
      code: 'multiple_candidates_tied',
      field_path: AMOUNT_PATH,
      clause:
        `The candidate set holds ${finding.pool_size} lines, above the bounded search size; ` +
        'no settling set was determined.',
      severity: 'blocking',
    });
  }

  // The frozen amount cap forces a human above Rs 5,00,000 regardless of score. Reported on
  // a hold this family was raising anyway; it never creates one on its own.
  const gross = invoice.gross_paise as unknown as number;
  if (Number.isFinite(amountCapPaise) && gross > amountCapPaise) {
    conflicts.push({
      code: 'amount_over_cap',
      field_path: GROSS_PATH,
      clause: 'Invoice gross exceeds the amount cap; a named human reviews regardless of score.',
      severity: 'blocking',
    });
  }

  return conflicts;
}

function proposalFor(finding: ResidualFinding, invoice: Invoice, amountCapPaise: number): HoldProposal {
  const conflicts = conflictsFor(finding, invoice, amountCapPaise);
  return {
    invoice_id: invoice.id,
    type: 'cardinality_residual',
    reason: reasonFor(finding, invoice.gross_paise as unknown as number),
    severity: highestSeverity(conflicts),
    conflicts,
  };
}

/**
 * The ledger this family searches in the many-to-one direction. `ctx.ledger` is documented
 * as "every other invoice in the run"; whether the invoice under examination is included is
 * not something a family should depend on, so it is added and de-duplicated here.
 */
function ledgerWith(invoice: Invoice, ledger: readonly Invoice[]): readonly Invoice[] {
  const seen = new Set<string>([String(invoice.id)]);
  const out: Invoice[] = [invoice];
  for (const row of ledger) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function paymentsOf(ctx: HoldContext): readonly Payment[] {
  return ctx.payments;
}

export const cardinalityFamily: HoldFamily = {
  id: CARDINALITY_FAMILY_ID,
  handles: ['cardinality_residual'],
  apply(ctx: HoldContext): readonly HoldProposal[] {
    const finding = findResidual(
      ctx.invoice,
      paymentsOf(ctx),
      ctx.candidates,
      ledgerWith(ctx.invoice, ctx.ledger),
      {
        date_window_days: ctx.policy.date_window_days,
        max_subset_size: ctx.policy.max_subset_size,
      },
    );
    if (finding === null) return [];
    return [proposalFor(finding, ctx.invoice, ctx.policy.amount_cap_paise)];
  },
};
