// W04b — the frozen policy constants.
//
// The amount cap, the settlement window and the subset bound are authored in
// eval/thresholds.json at Wave 0 and frozen there, not here. That separation is the whole
// point: the worker enforcing a limit does not also get to tune it. Widening one of these
// to make a red build green is the same move the incumbent ERP calls "change the
// tolerance", and it is refused for the same reason.
//
// So this module PARSES, and never supplies a default. A missing cap is not a cap of
// infinity — it is a configuration failure, and it throws. The alternative is a run that
// quietly clears a Rs 20,00,000 invoice because a key was misspelt.
//
// Two shapes arrive in practice and both are accepted:
//   * the frozen file's own nesting, `{ amount_cap_paise: { value, why } }`, which is what
//     eval/run.ts hands the engine as `thresholds.values.policy`
//   * the flattened form, `{ amount_cap_paise: 50000000 }`, which is what
//     engine/holds/registry.ts declares on `HoldContext.policy`
// Accepting both is not laxity: they are the same three constants, and refusing one of the
// two callers would push somebody into writing a translation layer with its own defaults.

import { z } from 'zod';
import type { Days, Paise } from '@/lib/types';
import { asPaise } from './money';

/** The three constants engine/match is permitted to read from the frozen block. */
export interface MatchPolicy {
  /** Above this an invoice goes to a named human regardless of score. */
  readonly amount_cap_paise: Paise;
  /** Bounded settlement window. Outside it, a pairing is an exception, not a match. */
  readonly date_window_days: Days;
  /** Upper bound on a bulk settlement. Real ones run to forty invoices. */
  readonly max_subset_size: number;
}

const IntegerValue = z.union([
  z.number().int(),
  z.object({ value: z.number().int() }).transform((o) => o.value),
]);

const PolicyBlock = z.object({
  amount_cap_paise: IntegerValue,
  date_window_days: IntegerValue,
  max_subset_size: IntegerValue,
});

/**
 * Reads the `policy` block. Throws with the parser's own report when a constant is missing
 * or is not an integer — loudly, because every silent alternative is worse.
 */
export function parsePolicy(input: unknown): MatchPolicy {
  const source = unwrapPolicyBlock(input);
  const parsed = PolicyBlock.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(
      'engine/match: the frozen policy block from eval/thresholds.json is unreadable — ' +
        `${issues}. engine/match does not supply defaults for a policy constant; a missing ` +
        'cap is a configuration failure, not an absent limit.',
    );
  }
  const v = parsed.data;
  if (v.date_window_days < 0) {
    throw new Error('engine/match: date_window_days is negative.');
  }
  if (v.max_subset_size < 1) {
    throw new Error('engine/match: max_subset_size is below 1.');
  }
  return {
    amount_cap_paise: asPaise(v.amount_cap_paise),
    date_window_days: v.date_window_days,
    max_subset_size: v.max_subset_size,
  };
}

/**
 * Callers hand us either the `policy` block itself or the whole thresholds document.
 * Reaching one level in is a convenience, not an interpretation: nothing outside the
 * `policy` key is read, and the floors are none of this module's business.
 */
function unwrapPolicyBlock(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  const record = input as Record<string, unknown>;
  if ('amount_cap_paise' in record) return record;
  const nested = record['policy'];
  if (nested !== undefined) return nested;
  return record;
}

/** True when the invoice sits above the frozen cap and a named human must look at it. */
export function exceedsAmountCap(grossPaise: Paise, policy: MatchPolicy): boolean {
  return Math.abs(grossPaise) > policy.amount_cap_paise;
}

/** True when a settlement gap falls inside the frozen window. Null days are outside it. */
export function insideWindow(days: Days | null, policy: MatchPolicy): boolean {
  if (days === null) return false;
  return Math.abs(days) <= policy.date_window_days;
}
