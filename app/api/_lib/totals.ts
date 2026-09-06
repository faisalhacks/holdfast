// Run totals, computed from rows.
//
// Nothing here is written down as a constant. Every count, every ratio and every rupee
// figure is folded out of the invoice, hold, candidate and outcome rows the repository
// returned. A number the API cannot derive from data is a number the API does not send.

import { HOLD_TYPES } from '@/lib/types';
import type {
  Hold,
  HoldType,
  Invoice,
  InvoiceId,
  Payment,
  Paise,
  RunTotals,
} from '@/lib/types';
import type { OutcomeRow } from './repository';
import { paiseFromDigits, sumPaise } from './money';

export interface TotalsInput {
  readonly invoices: readonly Invoice[];
  readonly payments: readonly Payment[];
  readonly outcomes: readonly OutcomeRow[];
  readonly holds: readonly Hold[];
}

function emptyHoldCounts(): Record<HoldType, number> {
  const counts = {} as Record<HoldType, number>;
  for (const type of HOLD_TYPES) counts[type] = 0;
  return counts;
}

function grossOf(index: Map<InvoiceId, Invoice>, id: InvoiceId): Paise {
  const invoice = index.get(id);
  return invoice ? invoice.gross_paise : (0 as Paise);
}

export function computeRunTotals(input: TotalsInput): RunTotals {
  const byId = new Map<InvoiceId, Invoice>(input.invoices.map((i) => [i.id, i]));

  const invoicesTotal = input.outcomes.length;
  const autoCleared = input.outcomes.filter((o) => o.status === 'auto_cleared');
  const held = input.outcomes.filter((o) => o.status === 'held');
  const unmatched = input.outcomes.filter((o) => o.status === 'unmatched');

  const holdsByType = emptyHoldCounts();
  let conflictsEmitted = 0;
  const conflictsByInvoice = new Map<InvoiceId, number>();
  for (const hold of input.holds) {
    holdsByType[hold.type] += 1;
    conflictsEmitted += hold.conflicts.length;
    conflictsByInvoice.set(
      hold.invoice_id,
      (conflictsByInvoice.get(hold.invoice_id) ?? 0) + hold.conflicts.length,
    );
  }

  const heldWithoutConflict = held.filter(
    (o) => (conflictsByInvoice.get(o.invoice_id) ?? 0) === 0,
  ).length;

  const invoiced = sumPaise(input.outcomes.map((o) => grossOf(byId, o.invoice_id)));
  const cleared = sumPaise(autoCleared.map((o) => grossOf(byId, o.invoice_id)));
  const heldAmount = sumPaise(held.map((o) => grossOf(byId, o.invoice_id)));

  const decided = autoCleared.length;

  return {
    invoices_total: invoicesTotal,
    payments_total: input.payments.length,
    decided_count: decided,
    coverage: invoicesTotal === 0 ? 0 : decided / invoicesTotal,
    auto_cleared_count: autoCleared.length,
    held_count: held.length,
    human_required_count: held.length + unmatched.length,
    unmatched_count: unmatched.length,
    holds_by_type: holdsByType,
    conflicts_emitted: conflictsEmitted,
    held_invoices_without_conflict: heldWithoutConflict,
    amount_invoiced_paise: paiseFromDigits(invoiced.toString(), 'amount_invoiced_paise'),
    amount_auto_cleared_paise: paiseFromDigits(
      cleared.toString(),
      'amount_auto_cleared_paise',
    ),
    amount_held_paise: paiseFromDigits(heldAmount.toString(), 'amount_held_paise'),
  };
}
