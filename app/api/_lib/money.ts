// Money on the wire.
//
// Every monetary quantity in HOLDFAST is an integer count of paise, stored BIGINT.
// JSON has no int64, so a BIGINT cannot be handed to a client unexamined: past 2^53-1 a
// JSON number silently loses digits, and a silent rounding bug wearing a plausible face
// is exactly the failure this project exists to argue against.
//
// The rule, applied uniformly by `encode()` in ./wire.ts and published at GET /api/meta:
//
//   * a money field's name always ends in `_paise`
//   * it is a JSON NUMBER when the exact value is provably inside the IEEE-754
//     safe-integer range
//   * otherwise the numeric field is ABSENT and a sibling named `<field>_paise_string`
//     carries the exact decimal digits as a string
//
// A client therefore reads `x_paise` when it is present and `x_paise_string` when it is
// not. Never a float. Never a string where a number would have been exact.

import type { Paise } from '@/lib/types';

export const MONEY_UNIT = 'paise';

/** Suffix appended to a money field name when the value is too wide for a JSON number. */
export const WIDE_SUFFIX = '_string';

const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SAFE_MIN = BigInt(Number.MIN_SAFE_INTEGER);

/** Raised when a stored BIGINT cannot cross into a JS integer without losing digits. */
export class WideMoneyError extends Error {
  readonly field: string;
  readonly digits: string;

  constructor(field: string, digits: string) {
    super(`money field "${field}" holds ${digits} paise, outside the safe-integer range`);
    this.name = 'WideMoneyError';
    this.field = field;
    this.digits = digits;
  }
}

export function withinSafeRange(value: bigint): boolean {
  return value <= SAFE_MAX && value >= SAFE_MIN;
}

/**
 * bigint -> number, only ever called once the caller has PROVEN the operand sits inside
 * the safe-integer range. Under that proof the conversion is exact: every integer with
 * magnitude at or below 2^53-1 is representable in a double without rounding. This is the
 * single narrowing point in the codebase and it is deliberately not inlined.
 */
function narrow(value: bigint): number {
  return Number(value);
}

/** Exact integer view of a stored paise value, whatever shape it arrived in. */
export function exact(value: Paise | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isInteger(value)) throw new WideMoneyError('<inline>', String(value));
  return BigInt(value);
}

/**
 * Decodes a BIGINT as pg hands it over — decimal digits in a string — into the branded
 * scalar the contract uses. Throws rather than rounds when the digits do not fit.
 */
export function paiseFromDigits(digits: string, field: string): Paise {
  const value = BigInt(digits);
  if (!withinSafeRange(value)) throw new WideMoneyError(field, value.toString());
  return narrow(value) as Paise;
}

export type MoneyWire = Record<string, number | string | null>;

/**
 * Encodes one money field under the published rule. Returns an object to spread, because
 * the KEY changes when the value is too wide to be a JSON number.
 */
export function moneyField(key: string, value: Paise | number | bigint): MoneyWire {
  const v = exact(value);
  if (withinSafeRange(v)) return { [key]: narrow(v) };
  return { [`${key}${WIDE_SUFFIX}`]: v.toString() };
}

export function nullableMoneyField(
  key: string,
  value: Paise | number | bigint | null | undefined,
): MoneyWire {
  if (value === null || value === undefined) return { [key]: null };
  return moneyField(key, value);
}

/** Sums in bigint, so an aggregate over many rows never rounds on the way to the wire. */
export function sumPaise(values: Iterable<Paise | number | bigint>): bigint {
  let acc = BigInt(0);
  for (const v of values) acc += exact(v);
  return acc;
}

/** A signed difference between two stored quantities, kept exact. */
export function diffPaise(left: Paise | number | bigint, right: Paise | number | bigint): bigint {
  return exact(left) - exact(right);
}
