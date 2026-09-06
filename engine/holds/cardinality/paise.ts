// W05c — integer money.
//
// Every quantity in this family is an integer count of minor units. Subset-sum on
// integers is exact; subset-sum on floats is a rounding bug that presents as a match.
// That exactness is the whole reason the search is allowed to decide anything at all,
// so the invariant is checked at the boundary rather than assumed.

import type { Paise } from '@/lib/types';

/** The additive identity, typed. */
export const NIL: Paise = 0 as Paise;

/**
 * Brands an integer as minor units, throwing on anything else.
 *
 * Throwing rather than coercing is deliberate: a fractional minor unit means an upstream
 * stage produced a float, and a family that quietly rounds it would hand the search a
 * target it can never hit — or, worse, one it hits by accident.
 */
export function minorUnits(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `cardinality: ${String(value)} is not a whole count of minor units. ` +
        'Money is an integer here; a fraction means a float reached a money path upstream.'
    );
  }
  return value as Paise;
}

export function isWhole(value: number): boolean {
  return Number.isSafeInteger(value);
}

export function plus(a: Paise, b: Paise): Paise {
  return minorUnits(a + b);
}

export function minus(a: Paise, b: Paise): Paise {
  return minorUnits(a - b);
}

export function magnitude(a: Paise): Paise {
  return minorUnits(a < 0 ? -a : a);
}

export function accumulate(values: readonly Paise[]): Paise {
  let running = 0;
  for (const value of values) running += value;
  return minorUnits(running);
}
