// W04b — integer minor units.
//
// Money is an integer count of paise and nothing in this module ever lets it become
// anything else. There is no float path here, no string path, and no parse of a decimal
// literal: the dataset already carries `gross_paise`, `net_paise` and `amount_paise` as
// integers, so the only arithmetic that happens is addition, subtraction and a rounded
// scaling by a declared ratio.
//
// `scalePaise` is the one place a ratio touches money. It rounds back to an integer
// immediately and returns `Paise`, so a tolerance band expressed as a percentage becomes a
// paise bound before it is ever compared against a delta. A comparison between a float
// bound and an integer delta is how a rounding bug acquires a plausible face.

import type { Paise, Ratio } from '@/lib/types';

/** Asserts integrality and brands. Throws rather than coercing — a coerced total is a lie. */
export function asPaise(value: number): Paise {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(
      `engine/match: ${String(value)} is not an integer count of minor units. Money is paise.`,
    );
  }
  return value as Paise;
}

/** Sum. Empty sums to zero, which is the correct settled total of no settlements. */
export function sumPaise(values: readonly Paise[]): Paise {
  let carried = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) {
      throw new Error(`engine/match: refusing to add a non-integer minor-unit value.`);
    }
    carried += v;
  }
  return asPaise(carried);
}

/** `to - from`, signed. Positive means the payment side is larger. */
export function deltaPaise(from: Paise, to: Paise): Paise {
  return asPaise(to - from);
}

export function absPaise(value: Paise): Paise {
  return asPaise(Math.abs(value));
}

/**
 * A declared ratio applied to a magnitude, rounded back to an integer immediately.
 * Used only to turn a percentage tolerance into a paise bound.
 */
export function scalePaise(value: Paise, ratio: Ratio): Paise {
  return asPaise(Math.round(Math.abs(value) * ratio));
}

/** The larger of two paise bounds. Bands are declared as both an absolute and a ratio. */
export function maxPaise(a: Paise, b: Paise): Paise {
  return a >= b ? a : b;
}
