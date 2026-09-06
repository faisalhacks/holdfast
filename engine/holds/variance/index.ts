/**
 * W05b — the VARIANCE hold family.
 *
 * Exported from this directory for the orchestrator to wire into
 * `engine/holds/registry.ts` at the Wave 3 merge gate. This family does not edit the
 * registry, does not release a hold, and does not decide a case. It proposes typed holds
 * and the evidence for each one.
 *
 * What it looks at, in one sentence each:
 *
 *   price_variance        a settled amount that does not equal the invoice, with the CAUSE
 *                         named — bank charge, TDS, early-payment discount, rounding — or
 *                         honestly marked unattributed when nothing reconciles.
 *   quantity_variance     declared, never raised. See below.
 *   tax_variance          a PERCENTAGE-type tax breach, including a misallocated split.
 *   tax_amount_range      an ABSOLUTE-type tax breach. A different Oracle code on purpose.
 *   dist_variance         gross does not equal net plus tax.
 *   period_deferral       the booked period is not the invoice date's period.
 *   credit_note_crossing  a credit note raised in one period and received in the next.
 *
 * ── On `quantity_variance` ───────────────────────────────────────────────────
 * It is declared in `handles` and it is never raised, and that is the correct outcome
 * rather than a gap. A quantity hold is the third leg of a three-way match: billed against
 * RECEIVED, line by line. The contract has no PO document, no receipt and no invoice lines
 * — `purchase_order_reference` is a string on the header, not a quantity — so there is no
 * received quantity to compare a billed quantity against. Standing a proxy up in its place
 * (splitting an amount by a guessed unit price, say) would produce a hold code with a
 * number behind it that means nothing, which is worse than a count of zero. The slot stays
 * declared so the eval can report the type and show it empty.
 *
 * ── On tolerances ────────────────────────────────────────────────────────────
 * Every threshold this family applies is a named, typed `Tolerance` in `./tolerances.ts`.
 * When a variance does not clear one, the answer is a typed hold. It is never a widened
 * tolerance: widening is a recorded DECISION with a reviewer and a reason, taken by a human
 * downstream, and never a quiet edit here to turn a red row green.
 */

import type { HoldFamily, HoldProposal } from '@/engine/holds/registry';
import type { HoldType } from '@/lib/types';
import { distributionCheck, periodChecks, settlementCheck, taxChecks } from './checks';

/** The hold types this family is permitted to raise. */
export const VARIANCE_HOLD_TYPES: readonly HoldType[] = Object.freeze([
  'price_variance',
  'quantity_variance',
  'tax_variance',
  'tax_amount_range',
  'dist_variance',
  'period_deferral',
  'credit_note_crossing',
]);

export const varianceFamily: HoldFamily = {
  id: 'variance',
  handles: VARIANCE_HOLD_TYPES,
  apply(ctx) {
    const out: HoldProposal[] = [];
    const seen = new Set<HoldType>();

    // Order is the order a reviewer reads them in: what the document says about itself
    // first, then what the money says about the document.
    for (const check of [distributionCheck, taxChecks, periodChecks, settlementCheck]) {
      for (const candidate of check(ctx)) {
        // One hold per type per invoice. Two findings of the same type travel as two
        // conflicts on one hold, which is what the conflict array is for.
        //
        // A proposal with no conflict is deliberately NOT filtered here. Every check builds
        // its conflicts before it builds its proposal, so an empty array would be a policy
        // bug — and the registry throws on one. Fail loudly beats a silently dropped hold,
        // because a silently dropped hold is an invoice that gets paid.
        if (seen.has(candidate.type)) continue;
        seen.add(candidate.type);
        out.push(candidate);
      }
    }

    return out;
  },
};

export { classifyDelta, CAUSE_CLAUSES, CAUSE_REASONS } from './cause';
export type { DeltaAttribution } from './cause';
export { establishedScheme, schemeOf } from './checks';
export type { SupplyScheme } from './checks';
export * from './tolerances';
