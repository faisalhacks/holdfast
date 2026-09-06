/**
 * W10 — the rule that turns a tolerance change into a released set.
 *
 * `assessToleranceChange` takes the change and the hold rows and returns, for every hold
 * the change could plausibly touch, a typed outcome and the clause behind it. Nothing here
 * reads a repository, a clock or an environment variable, and nothing here mutates a hold:
 * the function is a pure statement about what the rules say, which is the only kind of
 * statement an auditor can recompute.
 *
 * ─── THE THREE OUTCOMES ──────────────────────────────────────────────────────────────
 *
 *   released                 the change lifts this hold. Reached with a declared band,
 *                            in scope, open, the change is a widening, and the frozen hold
 *                            registry declares the type auto-releasable.
 *   requires_named_release   the change GOVERNS this hold — it is the recorded reason the
 *                            hold could come off — but the type is not auto-releasable, so
 *                            a named person must release it, by name, with a reason. The
 *                            tolerance change is never itself that act.
 *   withheld                 the change does not touch this hold, and `reason` says which
 *                            of the five conditions it failed.
 *
 * The gap between `released` and `requires_named_release` is the whole product. The
 * incumbent behaviour is that widening a tolerance auto-releases whatever it reaches; here
 * the widening reaches a blocking tax hold and STILL does not lift it, because lifting it
 * is a judgement with an author.
 *
 * ─── RECONCILIATION ──────────────────────────────────────────────────────────────────
 *
 * `reconcileRelease` compares what a recorded tolerance change SAYS it released against
 * what these rules say it could. Three populations come out of it, and the third is a
 * finding: holds released under a tolerance change that the rules do not govern at all.
 * That is the row an auditor is looking for, and this is the only place in the system that
 * can produce it — the API records the claim, and the rules are what test it.
 */

import { HOLD_POLICY } from '@/engine/holds/registry';
import type {
  CaseId,
  Hold,
  HoldId,
  HoldType,
  Invoice,
  InvoiceId,
  Tolerance,
  ToleranceDirection,
  ToleranceScope,
  VendorId,
} from '@/lib/types';
import { describeDirection, isWidening, toleranceDirection } from './direction';
import { reachOf, releasableHoldTypes, governedHoldTypes, type ReachBasis } from './governance';
import { digitsOf, sumPaise } from './paise';
import { describeScope, holdInScope, vendorResolver, type VendorResolver } from './scope';

/** The version stamped onto every assessment, so a stored result names the rules that made it. */
export const TOLERANCE_RULES_VERSION = 'tolerance.rules.v1';

export type ReleaseOutcome = 'released' | 'requires_named_release' | 'withheld';

export type WithheldReason =
  | 'already_released'
  | 'outside_declared_scope'
  | 'kind_does_not_reach_hold_type'
  | 'change_is_not_a_widening'
  | 'no_declared_band_to_move';

const WITHHELD_CLAUSE: Readonly<Record<WithheldReason, string>> = Object.freeze({
  already_released: 'the hold was already released when the change was made',
  outside_declared_scope: 'the hold sits outside the scope the reviewer declared',
  kind_does_not_reach_hold_type:
    'a tolerance of this kind does not govern this hold type; the condition that raises it is not tested against a band of this kind',
  change_is_not_a_widening:
    'only a widening can release a hold — a tightening, a retype and an unchanged value all release nothing',
  no_declared_band_to_move:
    'the engine tests this condition exactly or structurally, so there is no declared band of this kind for the change to move',
});

const OUTCOME_CLAUSE: Readonly<Record<Exclude<ReleaseOutcome, 'withheld'>, string>> =
  Object.freeze({
    released:
      'the widened band admits this row and the hold registry declares this type auto-releasable, so the hold lifts with the change',
    requires_named_release:
      'the change governs this hold, and the hold registry requires a named person to release this type with a reason; the tolerance change is the recorded reason, not the release',
  });

export interface AssessedHold {
  readonly hold_id: HoldId;
  readonly case_id: CaseId;
  readonly invoice_id: InvoiceId;
  readonly hold_type: HoldType;
  readonly outcome: ReleaseOutcome;
  /** Set only when `outcome` is `withheld`. */
  readonly withheld_reason: WithheldReason | null;
  /** The fixed clause for the outcome. Not generated prose. */
  readonly because: string;
  readonly in_scope: boolean;
  /** How this kind reaches this hold type, or null when it does not. */
  readonly reach: ReachBasis | null;
  readonly auto_releasable: boolean;
  readonly blocks_accounting: boolean;
  readonly open: boolean;
  /** Exact decimal digits, or null when the invoice was not supplied. */
  readonly invoice_gross_paise: string | null;
}

export interface ToleranceChangeAssessment {
  readonly rules_version: string;
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly scope: ToleranceScope;
  readonly direction: ToleranceDirection;
  readonly direction_clause: string;
  readonly scope_description: string;
  /** Every hold type a tolerance of the new kind reaches, in table order. */
  readonly reaches_hold_types: readonly HoldType[];
  /** The strict subset of those that a widening of this kind can actually lift. */
  readonly releasable_hold_types: readonly HoldType[];
  /** Every hold inside the declared scope, with its outcome. Ordered by hold id. */
  readonly holds: readonly AssessedHold[];
  readonly holds_considered: number;
  readonly holds_outside_scope: number;
  readonly released_hold_ids: readonly HoldId[];
  readonly requires_named_release_hold_ids: readonly HoldId[];
  readonly withheld_hold_ids: readonly HoldId[];
  /** Exact decimal digits of the gross of the invoices whose holds the change lifts. */
  readonly money_released_paise: string;
  /** The same, for holds the change governs but a named person must release. */
  readonly money_awaiting_named_release_paise: string;
  readonly note: string;
}

export interface ToleranceChangeInput {
  readonly from: Tolerance;
  readonly to: Tolerance;
  readonly scope: ToleranceScope;
  /** The hold rows as they stood when the change was made. Not mutated. */
  readonly holds: readonly Hold[];
  /**
   * Invoices behind those holds. Needed for vendor scope and for the money figures; both
   * degrade honestly when it is absent — a vendor-scoped change reaches nothing it cannot
   * establish a vendor for, and an unknown gross contributes nothing to a total.
   */
  readonly invoices?: readonly Invoice[];
  /** Supply a resolver instead of invoices when the caller already has one. */
  readonly vendorOf?: VendorResolver;
}

const ASSESSMENT_NOTE =
  'The released set is derived from the change, the hold rows and the static reach table — never asserted by whoever made the change. Recompute it and you get the same answer.';

function grossOf(invoiceById: Map<string, Invoice>, invoiceId: InvoiceId): bigint | null {
  const invoice = invoiceById.get(String(invoiceId));
  return invoice === undefined ? null : sumPaise([invoice.gross_paise]);
}

/**
 * What the rules say a tolerance change reaches, and what it lifts.
 *
 * Holds outside the declared scope are counted but not enumerated: a global change over a
 * large run would otherwise return the whole hold table, and a list nobody can read is not
 * evidence. Everything inside the scope is enumerated whatever its outcome, including the
 * ones the change cannot touch — "this widening reached your duplicate holds and did not
 * lift them" is the sentence that makes the control visible.
 */
export function assessToleranceChange(
  input: ToleranceChangeInput,
): ToleranceChangeAssessment {
  const invoices = input.invoices ?? [];
  const invoiceById = new Map<string, Invoice>(
    invoices.map((invoice) => [String(invoice.id), invoice]),
  );
  const vendorOf: VendorResolver =
    input.vendorOf ??
    vendorResolver(
      invoices.map((invoice) => ({
        id: invoice.id as InvoiceId,
        vendor_id: invoice.vendor_id as VendorId,
      })),
    );

  const direction = toleranceDirection(input.from, input.to);
  const widening = isWidening(direction);
  const reaches = governedHoldTypes(input.to.kind);
  const releasable = releasableHoldTypes(input.to.kind);

  const assessed: AssessedHold[] = [];
  let outsideScope = 0;

  for (const hold of input.holds) {
    const inScope = holdInScope(hold, input.scope, vendorOf);
    if (!inScope) {
      outsideScope += 1;
      continue;
    }

    const policy = HOLD_POLICY[hold.type];
    const reach = reachOf(input.to.kind, hold.type);
    const open = hold.released_at === null;
    const gross = grossOf(invoiceById, hold.invoice_id);

    // Ordered deliberately. `already_released` first because a closed row is not a
    // candidate whatever else is true of it, and reporting a widening as having "released"
    // a hold that was already off is the kind of inflated claim this whole file refuses.
    let outcome: ReleaseOutcome = 'withheld';
    let withheld: WithheldReason | null = null;
    if (!open) withheld = 'already_released';
    else if (reach === null) withheld = 'kind_does_not_reach_hold_type';
    else if (reach.basis !== 'declared') withheld = 'no_declared_band_to_move';
    else if (!widening) withheld = 'change_is_not_a_widening';
    else outcome = policy.auto_releasable ? 'released' : 'requires_named_release';

    assessed.push({
      hold_id: hold.id,
      case_id: hold.case_id,
      invoice_id: hold.invoice_id,
      hold_type: hold.type,
      outcome,
      withheld_reason: withheld,
      because:
        withheld === null
          ? OUTCOME_CLAUSE[outcome === 'released' ? 'released' : 'requires_named_release']
          : WITHHELD_CLAUSE[withheld],
      in_scope: true,
      reach: reach === null ? null : reach.basis,
      auto_releasable: policy.auto_releasable,
      blocks_accounting: policy.blocks_accounting,
      open,
      invoice_gross_paise: gross === null ? null : gross.toString(),
    });
  }

  assessed.sort((a, b) => (a.hold_id < b.hold_id ? -1 : a.hold_id > b.hold_id ? 1 : 0));

  const withOutcome = (outcome: ReleaseOutcome): readonly AssessedHold[] =>
    assessed.filter((row) => row.outcome === outcome);

  const moneyFor = (rows: readonly AssessedHold[]): string =>
    digitsOf(
      sumPaise(
        rows
          .map((row) => row.invoice_gross_paise)
          .filter((digits): digits is string => digits !== null)
          .map((digits) => BigInt(digits)),
      ),
    );

  const released = withOutcome('released');
  const named = withOutcome('requires_named_release');

  return {
    rules_version: TOLERANCE_RULES_VERSION,
    from: input.from,
    to: input.to,
    scope: input.scope,
    direction,
    direction_clause: describeDirection(direction),
    scope_description: describeScope(input.scope),
    reaches_hold_types: reaches,
    releasable_hold_types: releasable,
    holds: assessed,
    holds_considered: assessed.length,
    holds_outside_scope: outsideScope,
    released_hold_ids: released.map((row) => row.hold_id),
    requires_named_release_hold_ids: named.map((row) => row.hold_id),
    withheld_hold_ids: withOutcome('withheld').map((row) => row.hold_id),
    money_released_paise: moneyFor(released),
    money_awaiting_named_release_paise: moneyFor(named),
    note: ASSESSMENT_NOTE,
  };
}

export interface ReleaseReconciliation {
  readonly rules_version: string;
  /** The `affected_hold_ids` the recorded change claims. */
  readonly recorded: readonly HoldId[];
  /** Recorded, and the rules lift them on the change alone. */
  readonly released_by_the_change: readonly HoldId[];
  /** Recorded, and the rules say a named person had to do it. Explained, not a finding. */
  readonly released_by_a_named_person: readonly HoldId[];
  /**
   * Recorded, and the rules do not govern them at all. THE FINDING: a hold came off under
   * a tolerance change that could not have reached it.
   */
  readonly released_without_governance: readonly HoldId[];
  /** The rules would have lifted these and the record does not claim them. */
  readonly governed_but_not_released: readonly HoldId[];
  /** True when nothing was released outside what the rules govern. */
  readonly reconciles: boolean;
  readonly note: string;
}

const RECONCILIATION_NOTE =
  'Recomputes the released set from the rules and compares it with what the change recorded. A hold released under a change that does not govern it is a finding; a hold the rules govern but only a named person may lift is explained, not a finding.';

/**
 * Test a recorded release against the rules.
 *
 * A recorded set that is LARGER than the rules' auto-release set is not automatically
 * wrong: the API asks a named reviewer for approval before releasing anything, and a
 * reviewer may legitimately lift a hold the rules put in `requires_named_release`. What is
 * never legitimate is releasing a hold the change does not govern at all, and that
 * population is separated out rather than folded into a single pass/fail.
 */
export function reconcileRelease(
  assessment: ToleranceChangeAssessment,
  recordedHoldIds: readonly HoldId[],
): ReleaseReconciliation {
  const recorded = [...recordedHoldIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const recordedSet = new Set(recorded.map((id) => String(id)));

  const releasedSet = new Set(assessment.released_hold_ids.map((id) => String(id)));
  const namedSet = new Set(assessment.requires_named_release_hold_ids.map((id) => String(id)));

  const byTheChange = recorded.filter((id) => releasedSet.has(String(id)));
  const byAPerson = recorded.filter((id) => namedSet.has(String(id)));
  const ungoverned = recorded.filter(
    (id) => !releasedSet.has(String(id)) && !namedSet.has(String(id)),
  );
  const notRecorded = assessment.released_hold_ids.filter((id) => !recordedSet.has(String(id)));

  return {
    rules_version: assessment.rules_version,
    recorded,
    released_by_the_change: byTheChange,
    released_by_a_named_person: byAPerson,
    released_without_governance: ungoverned,
    governed_but_not_released: notRecorded,
    reconciles: ungoverned.length === 0,
    note: RECONCILIATION_NOTE,
  };
}
