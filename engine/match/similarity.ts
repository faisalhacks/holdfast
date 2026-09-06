// W04b — string similarity.
//
// One thin, pure wrapper over `fuzzball`, plus the digit-sequence view that `fuzzball`
// cannot give us.
//
// TWO THINGS ARE DELIBERATE HERE.
//
// `full_process: false` on every call. `fuzzball`'s own cleanup lower-cases, strips
// non-alphanumerics and collapses whitespace — which is a second, undeclared normaliser
// sitting underneath the declared one in engine/normalise. Leaving it on would mean a sweep
// over normalisation profiles was measuring the sum of two pipelines, one of which nobody
// chose and no report names. Every string reaching this module has already been through a
// declared profile, and it is compared exactly as that profile left it.
//
// The comparator is DATA, not a call site. `MatchSpec` names it; this module dispatches on
// the name. A search agent trying `partial_token_set_ratio` for a truncated bank narration
// edits a spec, not a line of scoring logic.

import {
  WRatio,
  partial_ratio,
  partial_token_set_ratio,
  ratio as simple_ratio,
  token_set_ratio,
  token_sort_ratio,
} from 'fuzzball';
import type { Ratio } from '@/lib/types';

export const COMPARATORS = [
  'token_set_ratio',
  'partial_token_set_ratio',
  'token_sort_ratio',
  'partial_ratio',
  'ratio',
  'WRatio',
] as const;
export type ComparatorId = (typeof COMPARATORS)[number];

/** The brief's default, and the one every profile in engine/normalise was ordered for. */
export const DEFAULT_COMPARATOR: ComparatorId = 'token_set_ratio';

const FUZZ_OPTIONS = { full_process: false } as const;

/**
 * Similarity in [0, 1]. `fuzzball` reports 0-100; the contract's `Ratio` is a proportion,
 * and mixing the two scales is how a weight silently becomes a hundred times itself.
 *
 * Empty on either side is 0, not an error and not 1: an absent value is absent evidence.
 */
export function compare(comparator: ComparatorId, a: string, b: string): Ratio {
  if (a === '' || b === '') return 0;
  if (a === b) return 1;
  const raw = rawCompare(comparator, a, b);
  if (!Number.isFinite(raw)) return 0;
  return clampRatio(raw / 100);
}

function rawCompare(comparator: ComparatorId, a: string, b: string): number {
  switch (comparator) {
    case 'token_set_ratio':
      return token_set_ratio(a, b, FUZZ_OPTIONS);
    case 'partial_token_set_ratio':
      return partial_token_set_ratio(a, b, FUZZ_OPTIONS);
    case 'token_sort_ratio':
      return token_sort_ratio(a, b, FUZZ_OPTIONS);
    case 'partial_ratio':
      return partial_ratio(a, b, FUZZ_OPTIONS);
    case 'ratio':
      return simple_ratio(a, b, FUZZ_OPTIONS);
    case 'WRatio':
      return WRatio(a, b, FUZZ_OPTIONS);
    default:
      throw new Error(`engine/match: unknown comparator "${String(comparator)}"`);
  }
}

export function clampRatio(value: number): Ratio {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

const WHITESPACE = /\s+/g;

/**
 * The whitespace-free view. A bank narration writes `AMBERKOTTECHWORK` where the ledger
 * writes `Amberkot Techworks`, and no token-level rule recovers a boundary the bank
 * removed. Comparing both views and taking the better of the two is monotone: it can never
 * make a closer pair score lower than a further one.
 */
export function despace(value: string): string {
  return value.replace(WHITESPACE, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// The digit view
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which end of a digit string may be missing on the other side.
 *
 * BOTH ENDS DRIFT, and a rule that admits only one gets half the dataset wrong. A narration
 * writing `1342` for `1342/26-27` dropped the fiscal-year TAIL; a narration writing `5713`
 * for `INV/2026/05713` dropped the year HEAD. `either` admits both and is the default;
 * `none` turns containment off entirely and leaves only exact agreement.
 */
export const DIGIT_CONTAINMENTS = ['none', 'prefix', 'suffix', 'either'] as const;
export type DigitContainment = (typeof DIGIT_CONTAINMENTS)[number];

export interface DigitAgreementSpec {
  readonly digit_min_length: number;
  readonly digit_strip_leading_zeros: boolean;
  readonly digit_containment: DigitContainment;
}

const LEADING_ZEROS = /^0+(?=\d)/;

/**
 * Agreement between two digit sequences, in [0, 1].
 *
 * `NormalisationResult.digits` is every digit of the RAW value in order, separators
 * discarded. It is the only bridge across invoice-number convention drift: `INV/2024/0042`
 * and `INV20240042` agree here and cannot agree token-wise, because the delimiters that
 * would have made the tokens were never written in the second form.
 *
 * Conservative on purpose. Full equality scores 1; one string sitting whole at an END of the
 * other scores in proportion to how much of it that is; anything else scores 0. Credit for a
 * coincidental overlap in the MIDDLE is precisely how a false clear is manufactured, and the
 * figure we publish is an absolute count of those.
 */
export function digitAgreement(a: string, b: string, spec: DigitAgreementSpec): Ratio {
  if (a === '' || b === '') return 0;
  if (a.length < spec.digit_min_length || b.length < spec.digit_min_length) return 0;
  if (a === b) return 1;

  if (spec.digit_strip_leading_zeros) {
    const sa = a.replace(LEADING_ZEROS, '');
    const sb = b.replace(LEADING_ZEROS, '');
    if (sa === sb && sa.length >= spec.digit_min_length) return 1;
  }

  if (spec.digit_containment === 'none') return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < spec.digit_min_length) return 0;

  const head = spec.digit_containment !== 'suffix' && longer.startsWith(shorter);
  const tail = spec.digit_containment !== 'prefix' && longer.endsWith(shorter);
  if (!head && !tail) return 0;
  return clampRatio(shorter.length / longer.length);
}
