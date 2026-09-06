// W05c — bounded exact subset-sum over integer paise.
//
// ─── Why this file is written the way it is ──────────────────────────────────────────
//
// Subset-sum is NP-hard, and the naive reading of "find the payments that settle this
// invoice" is a search over every subset of the ledger. Two bounds from
// eval/thresholds.json make it tractable, and both are DOMAIN bounds rather than
// performance tricks:
//
//   date_window_days = 45   the caller filters the pool before it gets here. A payment
//                           settling an invoice from six months earlier is an exception a
//                           human should see, not a match to find.
//   max_subset_size  = 40   real bulk remittances settle twelve to forty documents. This
//                           is the size of the answer, and it is also the size of the
//                           POOL we are willing to search: a pool larger than the largest
//                           admissible answer is not searched at all (`null` from
//                           `buildBoundedSubsetIndex`), and the caller holds instead of
//                           guessing. Declining to search can never clear anything.
//
// With the pool capped at 40, meet-in-the-middle is exact and cheap: at most 2^20 subset
// sums per half. Time O(2^(n/2) log 2^(n/2)), space O(2^(n/2)), n <= 40. A dense DP over
// paise is not an option and is not used — an invoice gross runs to ~10^9 paise, so the
// table would have a billion cells to hold a handful of reachable sums.
//
// ─── Exactness ───────────────────────────────────────────────────────────────────────
//
// Every value is an integer count of paise. Sums are bounded by 40 x ~10^10 paise, which
// is far below 2^53, so every addition and comparison here is exact. That is the whole
// argument for integer minor units: subset-sum on integers has no epsilon, and a match
// that is "within rounding" is a different question with a different hold code.
//
// ─── Ties ────────────────────────────────────────────────────────────────────────────
//
// `solutionsFor` enumerates DISTINCT solutions up to a caller-supplied limit rather than
// returning the first one. A second solution is not a curiosity: it means the amount
// evidence does not identify a settling set, and a caller that took the first would be
// manufacturing a false clear. Callers ask for `limit = 2` and treat two as "unproven".

/** One exact solution: the indices it uses, in ascending order, and their sum in paise. */
export interface SubsetSolution {
  readonly indices: readonly number[];
  /** Integer paise. Equal to the target the solution was found for. */
  readonly sum: number;
}

export interface BoundedSubsetIndex {
  /** How many values are in the pool. */
  readonly poolSize: number;
  /**
   * Distinct subsets summing EXACTLY to `target`, at most `limit` of them. The empty
   * subset is never returned: a settlement of nothing is not a settlement.
   */
  solutionsFor(target: number, limit: number): readonly SubsetSolution[];
  /**
   * The largest sum achievable by any subset without exceeding `target`. Zero when no
   * non-empty subset fits, since the empty subset always sums to zero.
   */
  bestSumAtMost(target: number): number;
}

interface HalfTable {
  /** Subset sums, one per mask. */
  readonly sums: Float64Array;
  /** Ascending permutation of `sums`. */
  readonly order: Uint32Array;
  /** Index of the first value this half owns, within the caller's pool. */
  readonly offset: number;
  readonly count: number;
}

function enumerateHalf(values: readonly number[], offset: number, count: number): HalfTable {
  const total = 1 << count;
  const sums = new Float64Array(total);
  for (let mask = 1; mask < total; mask++) {
    // Strip the lowest set bit: sums[mask] is a previously computed sum plus one value.
    const low = mask & -mask;
    const bit = 31 - Math.clz32(low);
    const value = values[offset + bit];
    sums[mask] = (sums[mask ^ low] as number) + (value === undefined ? 0 : value);
  }
  const order = new Uint32Array(total);
  for (let i = 0; i < total; i++) order[i] = i;
  const asArray = Array.from(order);
  asArray.sort((a, b) => (sums[a] as number) - (sums[b] as number));
  for (let i = 0; i < total; i++) order[i] = asArray[i] as number;
  return { sums, order, offset, count };
}

/** First position in `order` whose sum is >= `value`. */
function lowerBound(table: HalfTable, value: number): number {
  let lo = 0;
  let hi = table.order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const sum = table.sums[table.order[mid] as number] as number;
    if (sum < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function maskIndices(mask: number, offset: number, into: number[]): void {
  let rest = mask;
  while (rest !== 0) {
    const low = rest & -rest;
    into.push(offset + (31 - Math.clz32(low)));
    rest ^= low;
  }
}

/**
 * Build a searchable index over `values` (integer paise, one per pool member).
 *
 * Returns `null` when the pool is larger than `maxSubsetSize`. That is not an error path
 * and it is not a fallback to something cheaper: it is the policy bound doing its job. The
 * caller must treat `null` as "no settlement is proven" and hold.
 */
export function buildBoundedSubsetIndex(
  values: readonly number[],
  maxSubsetSize: number,
): BoundedSubsetIndex | null {
  const poolSize = values.length;
  if (poolSize > maxSubsetSize) return null;
  if (poolSize === 0) {
    return {
      poolSize: 0,
      solutionsFor: () => [],
      bestSumAtMost: () => 0,
    };
  }

  const leftCount = poolSize >> 1;
  const rightCount = poolSize - leftCount;
  const left = enumerateHalf(values, 0, leftCount);
  const right = enumerateHalf(values, leftCount, rightCount);

  const solutionsFor = (target: number, limit: number): readonly SubsetSolution[] => {
    if (limit <= 0) return [];
    const out: SubsetSolution[] = [];
    const leftTotal = left.sums.length;
    for (let leftMask = 0; leftMask < leftTotal; leftMask++) {
      const need = target - (left.sums[leftMask] as number);
      let cursor = lowerBound(right, need);
      while (cursor < right.order.length) {
        const rightMask = right.order[cursor] as number;
        if ((right.sums[rightMask] as number) !== need) break;
        if (leftMask !== 0 || rightMask !== 0) {
          const indices: number[] = [];
          maskIndices(leftMask, left.offset, indices);
          maskIndices(rightMask, right.offset, indices);
          out.push({ indices, sum: target });
          if (out.length >= limit) return out;
        }
        cursor++;
      }
    }
    return out;
  };

  const bestSumAtMost = (target: number): number => {
    let best = 0;
    const leftTotal = left.sums.length;
    for (let leftMask = 0; leftMask < leftTotal; leftMask++) {
      const leftSum = left.sums[leftMask] as number;
      if (leftSum > target) continue;
      const need = target - leftSum;
      // The largest right sum <= need sits immediately before the first one > need.
      let cursor = lowerBound(right, need);
      while (cursor < right.order.length && (right.sums[right.order[cursor] as number] as number) === need) {
        cursor++;
      }
      if (cursor === 0) continue;
      const rightSum = right.sums[right.order[cursor - 1] as number] as number;
      const total = leftSum + rightSum;
      if (total <= target && total > best) best = total;
    }
    return best;
  };

  return { poolSize, solutionsFor, bestSumAtMost };
}

/**
 * The shape every caller actually wants: is the settlement proven, contested, or absent?
 *
 * `tied` is deliberately not collapsed into `none`. A contested settlement and a missing
 * one route to different conversations — one is "which of these two remittances was it",
 * the other is "no remittance has arrived" — and the conflict codes differ accordingly.
 */
export type ExactVerdict =
  | { readonly kind: 'unique'; readonly solution: SubsetSolution }
  | { readonly kind: 'tied'; readonly solutions: readonly SubsetSolution[] }
  | { readonly kind: 'none' };

export function verdictFor(index: BoundedSubsetIndex, target: number): ExactVerdict {
  const found = index.solutionsFor(target, 2);
  const first = found[0];
  if (first === undefined) return { kind: 'none' };
  if (found.length === 1) return { kind: 'unique', solution: first };
  return { kind: 'tied', solutions: found };
}
