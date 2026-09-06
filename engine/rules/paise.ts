/**
 * W10 — money for the rules and the export layers.
 *
 * Every monetary quantity in HOLDFAST is an integer count of paise. Two rules follow from
 * that and both are enforced here rather than remembered at each call site:
 *
 *   1. SUMS ARE `bigint`. A run-level total — money released by a tolerance change, money
 *      an unreviewed exception left exposed — is an aggregate over many rows, and an
 *      aggregate is exactly where a double silently stops being exact. `paise.ts` never
 *      narrows a sum back to a JS number.
 *   2. TOTALS CROSS AS DIGITS. A total leaves this layer as its exact decimal digits in a
 *      string, because JSON has no int64 and a JSON number past 2^53-1 loses digits
 *      without saying so. The API publishes the same rule at GET /api/meta for wire
 *      values; here the digits ARE the value, so there is nothing to lose.
 *
 * A RATIO OVER TWO MONETARY QUANTITIES is the one place a float is unavoidable — a
 * proportion is not money. It is computed by scaled integer division so that neither
 * operand is ever itself converted to a double: the division happens in `bigint` and only
 * the small scaled quotient becomes a number.
 */

import type { Paise, Ratio } from '@/lib/types';

/** Exact integer view of a stored paise value. Throws rather than rounds. */
export function exactPaise(value: Paise | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isInteger(value)) {
    throw new Error(
      `paise: expected an integer count of paise, got ${String(value)}. Money is never a float here.`,
    );
  }
  return BigInt(value);
}

/** Sums in bigint. An aggregate over a run never rounds on the way out. */
export function sumPaise(values: Iterable<Paise | number | bigint>): bigint {
  let total = BigInt(0);
  for (const value of values) total += exactPaise(value);
  return total;
}

/** Exact decimal digits of a paise quantity. The form every total leaves this layer in. */
export function digitsOf(value: Paise | number | bigint): string {
  return exactPaise(value).toString();
}

/** Denominator of the scaled integer division below. Six places is ample for a ratio. */
const RATIO_SCALE = BigInt(1000000);

/**
 * `part / whole` as a proportion in [0, 1], computed without either operand meeting a
 * double. Zero denominator returns 0 — an empty population has no ratio, and reporting one
 * as `NaN` puts a non-serialisable value into an audit artifact.
 */
export function ratioOf(part: bigint, whole: bigint): Ratio {
  if (whole === BigInt(0)) return 0;
  const scaled = (part * RATIO_SCALE) / whole;
  return Number(scaled) / Number(RATIO_SCALE);
}

/** The same proportion over two plain counts. Same zero-denominator answer. */
export function ratioOfCounts(part: number, whole: number): Ratio {
  if (whole === 0) return 0;
  return part / whole;
}
