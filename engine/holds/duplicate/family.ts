// W05a — engine/holds/duplicate. The HoldFamily the registry wires in.
//
// `engine/holds/registry.ts` is frozen and owned by the orchestrator, so this family is
// exported from its own directory and the registry imports it at the Wave 3 merge gate:
//
//     import { duplicateFamily } from './duplicate';
//
// The family proposes. It does not decide a case, it does not release anything, and it
// has no opinion on whether `duplicate_candidate` auto-releases — HOLD_POLICY owns that,
// and it says never, because a duplicate cleared quietly is an overpayment nobody sees.

import type {
  Conflict,
  ConflictSeverity,
  Invoice,
  Paise,
} from '@/lib/types';
import type { HoldContext, HoldFamily, HoldProposal } from '@/engine/holds/registry';
import { capConflict, conflictFor, distinctConflicts, severityFor } from './conflicts';
import {
  detectDuplicateSignals,
  isLive,
  type DuplicatePolicy,
  type DuplicateSignal,
} from './detect';

/** Everything the control found on one invoice, including what it stood down on. */
export interface DuplicateFinding {
  readonly invoice_id: string;
  readonly gross_paise: Paise;
  readonly above_cap: boolean;
  /** Every collision seen, live or not. */
  readonly signals: readonly DuplicateSignal[];
  /** The signals that put the hold on. */
  readonly live: readonly DuplicateSignal[];
  /** Collisions explained by a corroborated recurring or instalment series. */
  readonly suppressed: readonly DuplicateSignal[];
  /** Live only because the invoice sits above the frozen review cap. */
  readonly cap_escalated: readonly DuplicateSignal[];
}

const SEVERITY_RANK: Readonly<Record<ConflictSeverity, number>> = Object.freeze({
  advisory: 0,
  material: 1,
  blocking: 2,
});

function idsOf(signals: readonly DuplicateSignal[]): string {
  const ids = [...new Set(signals.map((s) => String(s.prior.id)))].sort();
  return ids.join(', ');
}

function reasonFor(subject: Invoice, live: readonly DuplicateSignal[], aboveCap: boolean): string {
  const segments: string[] = [];

  const refSame = live.filter((s) => s.kind === 'reference_repeat' && s.amount_matches);
  const refOther = live.filter((s) => s.kind === 'reference_repeat' && !s.amount_matches);
  const onInvoiceDate = live.filter((s) => s.kind === 'vendor_amount_date' && s.axis === 'invoice_date');
  const onReceivedDate = live.filter((s) => s.kind === 'vendor_amount_date' && s.axis === 'received_date');
  const near = live.filter((s) => s.kind === 'vendor_amount_near_date');

  if (refSame.length) segments.push(`reference repeated from ${idsOf(refSame)} at the same amount`);
  if (refOther.length) segments.push(`reference repeated from ${idsOf(refOther)} at a different amount`);
  if (onInvoiceDate.length) segments.push(`vendor, amount and invoice date match ${idsOf(onInvoiceDate)}`);
  if (onReceivedDate.length) segments.push(`vendor, amount and received date match ${idsOf(onReceivedDate)}`);
  for (const s of near) {
    segments.push(
      `vendor and amount match ${String(s.prior.id)} ${s.invoice_date_gap_days} day(s) apart`
    );
  }
  if (aboveCap) segments.push('value is above the review cap, so a named reviewer must act on it');

  return `duplicate_candidate on ${String(subject.id)}: ${segments.join('; ')}.`;
}

/**
 * Runs the control over one invoice against the ledger. Exported separately from the
 * family so the same logic can back a ledger-wide report without going through
 * `HoldContext` — the suppressions in particular are worth showing, and a suppression
 * nobody can see is indistinguishable from a miss.
 */
export function assessInvoice(
  subject: Invoice,
  ledger: readonly Invoice[],
  policy: DuplicatePolicy
): DuplicateFinding {
  const signals = detectDuplicateSignals(subject, ledger, policy);
  return {
    invoice_id: String(subject.id),
    gross_paise: subject.gross_paise,
    above_cap: subject.gross_paise > policy.amount_cap_paise,
    signals,
    live: signals.filter(isLive),
    suppressed: signals.filter((s) => s.suppressed_by !== null),
    cap_escalated: signals.filter((s) => isLive(s) && s.cap_escalated),
  };
}

/** The proposal for a finding that has at least one live signal, or null when it has none. */
export function proposalFor(
  subject: Invoice,
  finding: DuplicateFinding
): HoldProposal | null {
  if (finding.live.length === 0) return null;

  const raw: Conflict[] = finding.live.map(conflictFor);
  // Above the cap, the fact that value alone forces a human is itself part of the record.
  if (finding.above_cap) raw.push(capConflict());
  const conflicts = distinctConflicts(raw);

  // Defence in depth against the one failure `applyAll()` throws on. Every branch above
  // appends at least one conflict, so this cannot fire — and if it ever does, it fires
  // here with the invoice id rather than as an opaque registry error.
  if (conflicts.length === 0) {
    throw new Error(
      `duplicate family: ${String(subject.id)} has live duplicate signals but produced no conflict. ` +
        'Every held invoice must carry at least one; this is a policy bug, not a filter.'
    );
  }

  let severity: ConflictSeverity = 'advisory';
  for (const s of finding.live) {
    const sev = severityFor(s);
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[severity]) severity = sev;
  }
  // The cap is enforced HERE, not in the UI. Above it, a person reviews regardless of how
  // strong the signal was.
  if (finding.above_cap) severity = 'blocking';

  return {
    invoice_id: subject.id,
    type: 'duplicate_candidate',
    reason: reasonFor(subject, finding.live, finding.above_cap),
    severity,
    conflicts,
  };
}

export const duplicateFamily: HoldFamily = {
  id: 'duplicate',
  handles: ['duplicate_candidate'],
  apply(ctx: HoldContext): readonly HoldProposal[] {
    const finding = assessInvoice(ctx.invoice, ctx.ledger, ctx.policy);
    const proposal = proposalFor(ctx.invoice, finding);
    return proposal === null ? [] : [proposal];
  },
};

/** The same control over a whole ledger, one finding per invoice. */
export function assessLedger(
  ledger: readonly Invoice[],
  policy: DuplicatePolicy
): readonly DuplicateFinding[] {
  return ledger.map((inv) => assessInvoice(inv, ledger, policy));
}
