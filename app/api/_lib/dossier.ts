// The case dossier.
//
// One response that assembles what a reviewer today reconstructs from five or six
// screens: the document, the vendor, every typed hold with its policy, every candidate
// pairing with its field-level evidence and its arithmetic, the bank lines behind each
// one, the other documents from the same vendor that could be the duplicate, the decisions
// already recorded, any tolerance change that touched these holds, the feedback rules that
// rewrote a value, and the journal slice with its chain re-verified.
//
// Everything numeric here is folded out of those rows. Nothing is written down.

import type { CaseBundle } from './repository';
import type { Hold, MatchCandidate, Payment, PaymentId } from '@/lib/types';
import { daysBetween } from './ids';
import { verifyChain } from './journal';
import { sumPaise } from './money';
import { suggestRouting } from './routing';
import { describeScope, toleranceDirection } from './tolerance';

function paymentIndex(payments: readonly Payment[]): Map<string, Payment> {
  return new Map(payments.map((p) => [String(p.id), p]));
}

function resolvePayments(
  ids: readonly PaymentId[],
  index: Map<string, Payment>,
): readonly Payment[] {
  const out: Payment[] = [];
  for (const id of ids) {
    const payment = index.get(String(id));
    if (payment !== undefined) out.push(payment);
  }
  return out;
}

function releaseRequirement(hold: Hold): string {
  if (hold.released_at !== null) return 'already released';
  return hold.auto_releasable
    ? 'lifts by itself once the condition resolves, or a named human may release it'
    : 'a named human must release it, with a reason';
}

export function buildDossier(bundle: CaseBundle) {
  const index = paymentIndex(bundle.payments);
  const activeHolds = bundle.holds.filter((h) => h.released_at === null);
  const releasedHolds = bundle.holds.filter((h) => h.released_at !== null);

  const candidates = bundle.candidates.map((candidate: MatchCandidate) => {
    const payments = resolvePayments(candidate.payment_ids, index);
    return {
      ...candidate,
      payments,
      settled_paise: sumPaise(payments.map((p) => p.amount_paise)),
      payment_count: payments.length,
    };
  });

  const top = candidates[0] ?? null;

  // Other documents from this vendor carrying exactly the same gross. The day gap is
  // reported rather than judged: a window belongs to policy, not to a response body.
  const sameAmount = bundle.vendor_invoices
    .filter((i) => BigInt(i.gross_paise) === BigInt(bundle.invoice.gross_paise))
    .map((i) => ({
      invoice_id: i.id,
      reference: i.reference,
      invoice_date: i.invoice_date,
      period: i.period,
      gross_paise: i.gross_paise,
      days_from_this_invoice: daysBetween(
        String(bundle.invoice.invoice_date),
        String(i.invoice_date),
      ),
      purchase_order_reference: i.purchase_order_reference,
      recurrence: i.recurrence,
    }));

  const toleranceChanges = bundle.tolerance_changes.map((change) => ({
    ...change,
    direction: toleranceDirection(change.from, change.to),
    scope_description: describeScope(change.scope),
    released_holds_on_this_case: change.affected_hold_ids.filter((id) =>
      bundle.holds.some((h) => String(h.id) === String(id)),
    ),
  }));

  const blockedReasons = activeHolds.map((hold) => ({
    hold_id: hold.id,
    hold_type: hold.type,
    clause: hold.reason,
    severity: hold.severity,
    blocks_accounting: hold.blocks_accounting,
    conflicts: hold.conflicts,
  }));

  return {
    case: {
      case_id: bundle.exception.case_id,
      run_id: bundle.exception.run_id,
      invoice_id: bundle.exception.invoice_id,
      money_at_risk_paise: bundle.exception.money_at_risk_paise,
      held_since: bundle.exception.held_since,
      age_days: bundle.exception.age_days,
      application_status: bundle.exception.application_status,
      blocks_accounting: bundle.exception.blocks_accounting,
      payable: activeHolds.length === 0,
      open_hold_count: activeHolds.length,
      released_hold_count: releasedHolds.length,
    },
    invoice: bundle.invoice,
    vendor: bundle.vendor,
    holds: bundle.holds.map((hold) => ({
      ...hold,
      release_requires: releaseRequirement(hold),
      is_open: hold.released_at === null,
    })),
    candidates,
    money: {
      invoice_gross_paise: bundle.invoice.gross_paise,
      invoice_net_paise: bundle.invoice.net_paise,
      tax_total_paise: bundle.invoice.tax.total_paise,
      settled_on_top_candidate_paise: top === null ? null : top.settled_paise,
      residual_on_top_candidate_paise: top === null ? null : top.residual_paise,
    },
    duplicate_context: {
      same_vendor_invoice_count: bundle.vendor_invoices.length,
      same_amount_invoices: sameAmount,
      vendor_exposure_paise: sumPaise(bundle.vendor_invoices.map((i) => i.gross_paise)),
    },
    decisions: bundle.decisions,
    tolerance_changes: toleranceChanges,
    feedback_rules: bundle.feedback_rules,
    why_held: blockedReasons,
    suggested_next: suggestRouting(activeHolds.map((h) => h.type)),
    audit: {
      entries: bundle.audit,
      chain: verifyChain(bundle.audit),
    },
  };
}
