// W03 — the DELIBERATELY POOR baseline.
//
// This is what "we built a matcher" means when nobody measured it: raw string equality on
// the reference, then raw equality on the amount, take the first hit, clear it. No
// normalisation, no typed holds, no conflicts, no cardinality, no cap.
//
// It exists to be beaten, and specifically to be beaten in a way a single coverage number
// cannot show. Two failure modes are built in on purpose because both are real:
//
//   1. It takes the FIRST candidate on an exact amount tie. That is the SAP F.13
//      assignment-field failure — two rows whose amounts tie exactly and whose reference
//      fields disagree — and it produces confident, wrong, cleared payments.
//   2. It never applies a hold and never emits a conflict, so every per-hold-type recall
//      is 0 and conflicts_per_held_invoice is 0. A system that cannot say "stop" has no
//      workflow, only an answer.
//
// It reads the ledger and nothing else. It has never seen truth.json — that file is loaded
// by the scorer, in a different module, after every system has already returned.

import type { DatasetBundle } from '../dataset';
import type { SystemOutcome } from '../schema';

const byId = (a: { id: unknown }, b: { id: unknown }): number =>
  String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;

export const NAIVE_DESCRIPTION =
  'Naive exact match: raw-string equality on the extracted reference, then exact equality ' +
  'on the amount, first candidate wins. No normalisation, no typed holds, no conflicts, ' +
  'no amount cap. Included to show what a coverage number alone cannot distinguish.';

export function runNaiveExact(bundle: DatasetBundle): readonly SystemOutcome[] {
  const payments = [...bundle.payments].sort(byId);

  const byReference = new Map<string, typeof payments>();
  const byAmount = new Map<number, typeof payments>();
  for (const p of payments) {
    const ref = p.reference_extracted;
    if (ref !== null && ref !== '') {
      const bucket = byReference.get(ref);
      if (bucket) bucket.push(p);
      else byReference.set(ref, [p]);
    }
    const amount = p.amount_paise as unknown as number;
    const amountBucket = byAmount.get(amount);
    if (amountBucket) amountBucket.push(p);
    else byAmount.set(amount, [p]);
  }

  const outcomes: SystemOutcome[] = [];
  for (const invoice of bundle.invoices) {
    const exactRef = invoice.reference === '' ? undefined : byReference.get(invoice.reference);
    const chosen = exactRef ?? byAmount.get(invoice.gross_paise as unknown as number);

    if (chosen && chosen.length > 0 && chosen[0]) {
      // First hit wins, ties and all. This is the bug, and it is the point.
      outcomes.push({
        invoice_id: invoice.id,
        action: 'auto_clear',
        payment_ids: [chosen[0].id],
        hold_type: null,
        requires_human: false,
        conflicts: [],
      });
    } else {
      outcomes.push({
        invoice_id: invoice.id,
        action: 'unmatched',
        payment_ids: [],
        hold_type: null,
        requires_human: true,
        conflicts: [],
      });
    }
  }
  return outcomes;
}
