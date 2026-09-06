// W05d — the MATCHING hold family. The `HoldFamily` the registry wires in.
//
// `engine/holds/registry.ts` is frozen and orchestrator-owned, so this family is exported
// from its own directory and the registry imports it:
//
//     import { matchingFamily } from './matching';
//
// It raises two codes and no others: `matching` and `no_reference`. Both are declared
// `auto_releasable: true, blocks_accounting: false` in `HOLD_POLICY`, and that is the
// registry's call rather than this worker's. It is also the right one. An invoice with no
// payment against it is not exception work — nobody has erred, the money simply has not
// arrived — and routing it to a named person would fill the queue with rows whose only
// correct action is to wait. The condition resolves when a payment lands and the hold lifts
// with it. The invoice still cannot be PAID meanwhile, and accrual entries still may be
// raised, which is Oracle's distinction and the reason this reads as an AP system.
//
// ─── WHY THIS FAMILY IS SILENT SO OFTEN ──────────────────────────────────────────────
//
// It speaks last, and only about what nobody else has explained. `matching` stacked on a
// `duplicate_candidate` is true, uninformative, and a second sentence on a row whose reason
// a reviewer already had. So before proposing anything this family asks the other
// registered families whether they have something to say about the same invoice, and stands
// down if any of them does.
//
// It ASKS rather than infers because `applyAll()` deliberately shows a family nothing of
// its siblings' proposals, and re-deriving "would the variance family fire here?" from the
// same context would be a second copy of W05b's rules that drifts the first time one of
// them changes. `registeredFamilies()` is the registry's own accessor, every applicator is a
// pure function of the context, and the question is only asked about rows this family was
// already going to speak on — so the answer is exact and the cost is bounded by them.
//
// The stand-down is not free and it is worth saying what it costs. Some invoices that
// belong to this family are already carried by a sibling whose evidence is weaker, and
// `principal()` in engine/run.ts ranks a hold that needs a named human above one that
// releases itself. This family could take those rows by declaring a severity its evidence
// does not support. It does not. A severity inflated to win a tie-break is the same move as
// a widened tolerance, and it would buy a per-type recall figure with the one thing in this
// system that is supposed to mean something.

import type { Conflict, Invoice, MatchCandidate } from '@/lib/types';
import type { HoldContext, HoldFamily, HoldProposal } from '@/engine/holds/registry';
import { registeredFamilies } from '@/engine/holds/registry';
import { ACCEPT_MIN, assess, type MatchingFinding } from './assess';
import {
  capConflict,
  distinctConflicts,
  evidenceConflicts,
  matchingConflict,
  noReferenceConflict,
  severityOf,
} from './conflicts';

export const MATCHING_FAMILY_ID = 'matching';

function citedIds(finding: MatchingFinding): string {
  const ids = finding.recoveries.map((r) => String(r.payment_id));
  return ids.length === 0 ? 'no bank line' : ids.join(', ');
}

function shortfall(best: number | null): string {
  if (best === null) return `nothing was retained against a bar of ${ACCEPT_MIN}`;
  return `best ${best.toFixed(3)} against a bar of ${ACCEPT_MIN}`;
}

/**
 * The reason line: what happened, then the figures a reviewer needs before they can do
 * anything with it. Money is integer paise here as everywhere; there is no rupee field in
 * this system and no float on this path.
 */
function reasonFor(invoice: Invoice, finding: MatchingFinding): string {
  const id = String(invoice.id);
  const gross = invoice.gross_paise;
  const settled = gross - finding.residual_paise;

  switch (finding.cause) {
    case 'settling_line_carries_no_reference':
      return (
        `no_reference on ${id}: ${citedIds(finding)} reconciles ${settled} paise of ${gross} ` +
        `within the declared amount tolerance and its narration yields no reference token ` +
        `(${shortfall(finding.best_composite)}).`
      );
    case 'settling_line_names_another_document':
      return (
        `no_reference on ${id}: ${citedIds(finding)} reconciles ${settled} paise of ${gross} ` +
        `within the declared amount tolerance, and the reference tokens on it name another ` +
        `document (${shortfall(finding.best_composite)}).`
      );
    case 'no_candidate_retained':
      return (
        `matching on ${id}: no payment scored above the retention floor; ` +
        `${gross} paise unsettled (${shortfall(finding.best_composite)}).`
      );
    case 'nothing_reconciles_the_money':
      return (
        `matching on ${id}: no candidate settles ${gross} paise within the declared amount ` +
        `tolerance; nearest is ${citedIds(finding)} at ${settled} paise ` +
        `(${shortfall(finding.best_composite)}).`
      );
    default:
      return (
        `matching on ${id}: ${citedIds(finding)} reconciles ${settled} paise of ${gross} and ` +
        `names the document, and the pairing did not reach the acceptance bar ` +
        `(${shortfall(finding.best_composite)}).`
      );
  }
}

function conflictsFor(finding: MatchingFinding): readonly Conflict[] {
  const raw: Conflict[] = [];

  if (finding.type === 'no_reference') {
    raw.push(noReferenceConflict(finding.cause));
  } else {
    raw.push(matchingConflict(finding.cause));
  }

  const candidate: MatchCandidate | null = finding.candidate;
  if (candidate !== null) {
    const recovered = finding.recoveries.some((r) => r.recovered);
    raw.push(...evidenceConflicts(candidate, recovered));
  }

  // The frozen cap, reported on a hold that was firing anyway.
  if (finding.above_cap) raw.push(capConflict());

  return distinctConflicts(raw);
}

/**
 * The proposal for a finding. Throws rather than returning an empty conflict array: every
 * branch above appends at least one conflict, so this cannot fire — and if it ever does it
 * fires here, naming the invoice, rather than as an opaque registry error two frames up.
 */
export function proposalFor(invoice: Invoice, finding: MatchingFinding): HoldProposal {
  const conflicts = conflictsFor(finding);
  if (conflicts.length === 0) {
    throw new Error(
      `matching family: ${String(invoice.id)} produced a ${finding.type} finding with no ` +
        'conflict. Every held invoice must carry at least one; this is a policy bug, not a filter.',
    );
  }
  return {
    invoice_id: invoice.id,
    type: finding.type,
    reason: reasonFor(invoice, finding),
    severity: severityOf(conflicts),
    conflicts,
  };
}

/**
 * True when any other registered family has something to say about this invoice.
 *
 * Short-circuits on the first speaker, and is only ever reached for an invoice this family
 * was about to propose on, so the cost is bounded by the rows nobody else explained.
 */
export function anotherFamilySpeaks(ctx: HoldContext): boolean {
  for (const family of registeredFamilies()) {
    if (family.id === MATCHING_FAMILY_ID) continue;
    if (family.apply(ctx).length > 0) return true;
  }
  return false;
}

export const matchingFamily: HoldFamily = {
  id: MATCHING_FAMILY_ID,
  handles: ['matching', 'no_reference'],
  apply(ctx: HoldContext): readonly HoldProposal[] {
    const finding = assess(ctx, ctx.invoice);
    if (finding === null) return [];
    if (anotherFamilySpeaks(ctx)) return [];
    return [proposalFor(ctx.invoice, finding)];
  },
};
