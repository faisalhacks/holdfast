/**
 * THE ASSEMBLY POINT — orchestrator-owned and FROZEN.
 *
 * No worker owns this file. W04a builds normalisation, W04b builds matching, and W05a/b/c
 * build hold families; each is scored on its own glob and none of them can see the whole.
 * Wiring them together is a decision about the SYSTEM, so it belongs to whoever is
 * accountable for the system's number.
 *
 * `eval/` loads this at runtime through the interface documented in
 * `eval/engine-adapter.ts`. The harness may not read `engine/` — the thing that judges the
 * engine must not be shaped by the engine's internals — so this signature is the entire
 * contract between them, and it is deliberately narrow.
 *
 * The order below is the domain model, not an implementation convenience:
 *
 *   normalise -> match -> HOLDS -> decide
 *
 * Holds are applied AFTER matching but they are not a match outcome. A hold is a state on
 * an invoice that stops payment, and duplicate detection in particular runs over invoices
 * and never looks at a payment. Matching supplies evidence to the hold families; it does
 * not license them.
 *
 * Nothing here can clear an invoice that any family held. That is the one asymmetry worth
 * stating out loud: a hold beats a score, always, in both directions.
 */

import { applyAll, HOLD_POLICY, type HoldContext, type HoldProposal } from './holds/registry';
import { MATCH_SPEC_V1, matchLedger, parsePolicy, prepareLedger } from './match';
import type { MatchContext } from './match';
import type { MatchCandidate } from '@/lib/types';
import type {
  Conflict,
  ConflictSeverity,
  HoldType,
  Invoice,
  InvoiceId,
  IsoTimestamp,
  Payment,
  PaymentId,
  RunId,
} from '@/lib/types';

/** The shape `eval/engine-adapter.ts` validates. Every field is checked before scoring. */
export interface EngineDecision {
  readonly invoice_id: string;
  readonly action: 'auto_clear' | 'hold' | 'unmatched';
  /** The settling set, exactly. Empty for anything but an auto-clear. */
  readonly payment_ids: string[];
  readonly hold_type: HoldType | null;
  /** False only when no named person must act. */
  readonly requires_human: boolean;
  readonly conflicts: Conflict[];
}

export interface EngineInput {
  readonly invoices: Invoice[];
  readonly payments: Payment[];
  /** The parsed eval/thresholds.json. Only its `policy` block is read. */
  readonly thresholds: unknown;
  readonly run_id?: string;
  readonly now?: string;
}

const SEVERITY_RANK: Readonly<Record<ConflictSeverity, number>> = {
  advisory: 0,
  material: 1,
  blocking: 2,
};

/**
 * Which hold to report when several fired. Ranked by severity, then by whether it stops
 * accounting, then by whether a named human must release it.
 *
 * The tie-break matters: an invoice carrying both a duplicate_candidate and a
 * price_variance is a duplicate that also happens to be mispriced, and reporting the
 * variance would route it to the wrong desk. Every hold is still carried in `conflicts`;
 * this only decides the headline.
 */
function principal(proposals: readonly HoldProposal[]): HoldProposal {
  return [...proposals].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const aPolicy = HOLD_POLICY[a.type];
    const bPolicy = HOLD_POLICY[b.type];
    const byAccounting = Number(bPolicy.blocks_accounting) - Number(aPolicy.blocks_accounting);
    if (byAccounting !== 0) return byAccounting;
    const byRelease = Number(aPolicy.auto_releasable) - Number(bPolicy.auto_releasable);
    if (byRelease !== 0) return byRelease;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  })[0]!;
}

export function runEngine(input: EngineInput): EngineDecision[] {
  const policy = parsePolicy(input.thresholds);
  const run_id = (input.run_id ?? 'run_engine') as RunId;
  // Supplied, never read from the clock: two runs over one frozen dataset must not differ
  // because time passed between them.
  const now = (input.now ?? '1970-01-01T00:00:00.000Z') as IsoTimestamp;

  const ledger = prepareLedger(input.invoices, input.payments);
  const ctx: MatchContext = { run_id, spec: MATCH_SPEC_V1, policy, now };
  const match = matchLedger(ledger, ctx);

  const byInvoice = new Map(match.by_invoice.map((r) => [String(r.invoice_id), r]));
  const decisions: EngineDecision[] = [];

  for (const invoice of input.invoices) {
    const id = String(invoice.id);
    const ranked = byInvoice.get(id);
    const candidates: readonly MatchCandidate[] = ranked?.candidates ?? [];

    const holdCtx: HoldContext = {
      run_id,
      case_id: `case_${id}` as HoldContext['case_id'],
      invoice,
      payments: input.payments,
      candidates,
      ledger: input.invoices,
      // Passed through, never cast. `Paise` and `Days` are branded numbers and are
      // already assignable; wrapping them in Number() would be a no-op that trips the
      // money gate for exactly the right reason — the gate caught this line, not a
      // reviewer.
      policy: {
        amount_cap_paise: policy.amount_cap_paise,
        date_window_days: policy.date_window_days,
        max_subset_size: policy.max_subset_size,
      },
    };

    // `applyAll` throws if a family raises a type it did not declare, or emits a hold with
    // no conflict. Both are policy bugs and both are louder than they are inconvenient: a
    // silently dropped hold is an invoice that gets paid.
    const proposals = applyAll(holdCtx);

    if (proposals.length > 0) {
      const lead = principal(proposals);
      const conflicts = proposals.flatMap((p) => [...p.conflicts]);
      decisions.push({
        invoice_id: id,
        action: 'hold',
        payment_ids: [],
        hold_type: lead.type,
        // An auto-releasing hold clears when its condition resolves and needs nobody.
        // Anything else needs a named human with a reason, and says so here.
        requires_human: proposals.some((p) => !HOLD_POLICY[p.type].auto_releasable),
        conflicts,
      });
      continue;
    }

    const top = candidates[0];
    const accepted = top !== undefined && top.score.composite >= MATCH_SPEC_V1.ranking.accept_min;

    if (accepted) {
      decisions.push({
        invoice_id: id,
        action: 'auto_clear',
        payment_ids: top.payment_ids.map((p: PaymentId) => String(p)),
        hold_type: null,
        requires_human: false,
        conflicts: [...top.conflicts],
      });
      continue;
    }

    // No hold fired and nothing scored well enough. Not a match and not an exception with a
    // named cause — it goes to a person, and it is counted against coverage rather than
    // quietly folded into one of the other two.
    decisions.push({
      invoice_id: id,
      action: 'unmatched',
      payment_ids: [],
      hold_type: null,
      requires_human: true,
      conflicts: ranked ? [...ranked.conflicts] : [],
    });
  }

  return decisions;
}

export default runEngine;

/** Also exported under the adapter's alternative name. */
export const run = runEngine;

export type { InvoiceId };
