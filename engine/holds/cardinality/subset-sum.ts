// W05c — bounded subset-sum over integers.
//
// ── What this solves ─────────────────────────────────────────────────────────────────
// Given a pool of positive integer amounts and a target, find the subset whose sum is
// closest to the target from below, of size at most `maxSize`, AND report whether that
// subset is the ONLY one that reaches its sum. The second half of that sentence is the
// part that matters. A solver that returns one answer to an ambiguous question is worse
// than one that returns none, because its answer looks exactly like a correct one.
//
// ── Bounds ───────────────────────────────────────────────────────────────────────────
// Exact subset-sum is NP-hard, so this is bounded on three axes, all of them from
// eval/thresholds.json rather than from here:
//
//   the date window   caps the pool before the search sees it (window.ts)
//   max_subset_size   caps the cardinality of a solution at 40 — real bulk remittances
//                     settle twelve to forty invoices, so capping at three, as most
//                     demonstrations do, is why they look like demonstrations
//   a node budget     caps the work, and running out is an ANSWER ('exhausted'), not a
//                     silent fallback to the best guess so far
//
// ── Cost ─────────────────────────────────────────────────────────────────────────────
// Meet-in-the-middle for pools of at most 30: enumerate 2^(n/2) half-subsets on each
// side, sort one side by sum, and pair them off. Time O(2^(n/2) · n · log 2^(n/2)),
// space O(2^(n/2)) — for n = 30 that is 2^15 = 32,768 half-subsets per side, which is
// nothing. Above 30, depth-first with a suffix-sum bound and a node budget: worst case
// still O(2^n), but it stops and says so instead of running forever. In practice the
// evidence gate in evidence.ts keeps pools to a handful, and the wide paths are a safety
// net rather than the common case.
//
// Everything is integer arithmetic. Subset-sum on integers is exact; that exactness is
// the only reason a search is allowed to influence a hold at all.

export interface SubsetItem {
  /** Stable identity — a payment id, or an invoice id in the bulk-allocation direction. */
  readonly key: string;
  /** Strictly positive integer minor units. */
  readonly value: number;
}

export type SearchKind =
  /** A subset sums to the target exactly, and no other subset does. */
  | 'exact'
  /** No subset reaches the target; the best falls short, and nothing else matches it. */
  | 'partial'
  /** Two or more distinct subsets reach the best sum. Nothing is attributed. */
  | 'ambiguous'
  /** Nothing in the pool fits under the target at all. */
  | 'none'
  /** The node budget ran out before the question could be answered. */
  | 'exhausted';

export interface SearchOutcome {
  readonly kind: SearchKind;
  /** Sum of `chosen`. Zero for 'none', 'ambiguous' and 'exhausted'. */
  readonly sum: number;
  /** Keys of the accepted subset. EMPTY unless `kind` is 'exact' or 'partial'. */
  readonly chosen: readonly string[];
  /** On 'ambiguous', the sum both rival subsets reach. Zero otherwise. */
  readonly rivalSum: number;
  /** On 'ambiguous', the two rival subsets, in the order the search settled them. */
  readonly rivals: readonly (readonly string[])[];
  readonly method: 'meet_in_the_middle' | 'depth_first' | 'trivial';
  readonly nodes: number;
}

/** Above this many items, meet-in-the-middle's table stops being free. */
const MEET_IN_THE_MIDDLE_MAX = 26;

/** Depth-first node ceiling. Spending it is a reported outcome, never a silent answer. */
const NODE_BUDGET = 3_000_000;

const EMPTY: SearchOutcome = {
  kind: 'none',
  sum: 0,
  chosen: [],
  rivalSum: 0,
  rivals: [],
  method: 'trivial',
  nodes: 0,
};

function ordered(items: readonly SubsetItem[]): SubsetItem[] {
  return [...items].sort((a, b) => (b.value - a.value) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * The entry point. `maxSize` and the pool are already bounded by the caller; this decides
 * only how to search, never how wide to look.
 */
export function boundedSubsetSum(
  items: readonly SubsetItem[],
  target: number,
  maxSize: number
): SearchOutcome {
  if (!Number.isSafeInteger(target) || target <= 0) return EMPTY;
  const usable = ordered(items.filter((i) => Number.isSafeInteger(i.value) && i.value > 0));
  if (usable.length === 0 || maxSize <= 0) return EMPTY;
  return usable.length <= MEET_IN_THE_MIDDLE_MAX
    ? meetInTheMiddle(usable, target, maxSize)
    : depthFirst(usable, target, maxSize);
}

// ─────────────────────────────────────────────────────────────────────────────
// Meet in the middle
// ─────────────────────────────────────────────────────────────────────────────

interface HalfSubset {
  readonly sum: number;
  readonly size: number;
  readonly mask: number;
}

function enumerateHalf(
  items: readonly SubsetItem[],
  from: number,
  to: number,
  target: number,
  maxSize: number
): HalfSubset[] {
  const width = to - from;
  const out: HalfSubset[] = [];
  const combinations = 1 << width;
  for (let mask = 0; mask < combinations; mask++) {
    let sum = 0;
    let size = 0;
    let usable = true;
    for (let bit = 0; bit < width; bit++) {
      if ((mask & (1 << bit)) === 0) continue;
      const item = items[from + bit];
      if (!item) { usable = false; break; }
      sum += item.value;
      size += 1;
      if (sum > target || size > maxSize) { usable = false; break; }
    }
    if (usable) out.push({ sum, size, mask });
  }
  return out;
}

function keysOf(items: readonly SubsetItem[], from: number, mask: number, width: number): string[] {
  const out: string[] = [];
  for (let bit = 0; bit < width; bit++) {
    if ((mask & (1 << bit)) === 0) continue;
    const item = items[from + bit];
    if (item) out.push(item.key);
  }
  return out;
}

/** Largest index whose sum is at most `ceiling`, or -1. `list` is sorted by sum ascending. */
function highestAtMost(list: readonly HalfSubset[], ceiling: number): number {
  let low = 0;
  let high = list.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const entry = list[mid];
    if (!entry) break;
    if (entry.sum <= ceiling) { found = mid; low = mid + 1; } else { high = mid - 1; }
  }
  return found;
}

function meetInTheMiddle(items: readonly SubsetItem[], target: number, maxSize: number): SearchOutcome {
  const split = items.length >> 1;
  const leftWidth = split;
  const rightWidth = items.length - split;
  const left = enumerateHalf(items, 0, split, target, maxSize);
  const right = enumerateHalf(items, split, items.length, target, maxSize);
  const nodes = left.length + right.length;

  const bySize: HalfSubset[][] = [];
  for (const entry of right) {
    const bucket = bySize[entry.size] ?? (bySize[entry.size] = []);
    bucket.push(entry);
  }
  for (const bucket of bySize) {
    if (bucket) bucket.sort((a, b) => (a.sum - b.sum) || (a.mask - b.mask));
  }

  // Pass one — the best reachable sum at or below the target.
  let best = 0;
  for (const l of left) {
    const room = maxSize - l.size;
    if (room < 0) continue;
    const ceiling = target - l.sum;
    if (ceiling < 0) continue;
    for (let size = 0; size <= room && size < bySize.length; size++) {
      const bucket = bySize[size];
      if (!bucket) continue;
      const at = highestAtMost(bucket, ceiling);
      if (at < 0) continue;
      const entry = bucket[at];
      if (!entry) continue;
      const total = l.sum + entry.sum;
      if (total > best) best = total;
    }
    if (best === target) break;
  }

  if (best === 0) return { ...EMPTY, method: 'meet_in_the_middle', nodes };

  // Pass two — how many distinct subsets reach it. Two is enough to settle the question.
  const witnesses: string[][] = [];
  for (const l of left) {
    if (witnesses.length >= 2) break;
    const room = maxSize - l.size;
    if (room < 0) continue;
    const need = best - l.sum;
    if (need < 0) continue;
    for (let size = 0; size <= room && size < bySize.length; size++) {
      const bucket = bySize[size];
      if (!bucket) continue;
      // Binary search to the top of the equal-sum run, then walk down through it. Every
      // distinct mask at that sum is a distinct subset, which is exactly what is counted.
      let at = highestAtMost(bucket, need);
      while (at >= 0 && witnesses.length < 2) {
        const entry = bucket[at];
        if (!entry || entry.sum !== need) break;
        witnesses.push([
          ...keysOf(items, 0, l.mask, leftWidth),
          ...keysOf(items, split, entry.mask, rightWidth),
        ]);
        at -= 1;
      }
      if (witnesses.length >= 2) break;
    }
  }

  return settle(best, target, witnesses, 'meet_in_the_middle', nodes, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Depth first, budgeted
// ─────────────────────────────────────────────────────────────────────────────

function depthFirst(items: readonly SubsetItem[], target: number, maxSize: number): SearchOutcome {
  const suffix: number[] = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i--) {
    suffix[i] = (suffix[i + 1] ?? 0) + (items[i]?.value ?? 0);
  }

  let best = 0;
  let witnesses: string[][] = [];
  let nodes = 0;
  let exhausted = false;
  const stack: string[] = [];

  // Each subset is recorded exactly once, at the step that appends its last member, so
  // the witness count is a count of subsets and not of visits.
  const walk = (from: number, sum: number): void => {
    if (exhausted) return;
    if (stack.length >= maxSize) return;
    for (let i = from; i < items.length; i++) {
      if (sum + (suffix[i] ?? 0) < best) return;
      const item = items[i];
      if (!item) continue;
      const next = sum + item.value;
      if (next > target) continue;
      nodes += 1;
      if (nodes > NODE_BUDGET) { exhausted = true; return; }
      stack.push(item.key);
      if (next > best) { best = next; witnesses = [[...stack]]; }
      else if (next === best && witnesses.length < 2) { witnesses.push([...stack]); }
      if (!(best === target && witnesses.length >= 2)) walk(i + 1, next);
      stack.pop();
      if (exhausted) return;
      if (best === target && witnesses.length >= 2) return;
    }
  };

  walk(0, 0);

  if (exhausted) {
    return { kind: 'exhausted', sum: 0, chosen: [], rivalSum: 0, rivals: [], method: 'depth_first', nodes };
  }
  if (best === 0) return { ...EMPTY, method: 'depth_first', nodes };
  return settle(best, target, witnesses, 'depth_first', nodes, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// The verdict
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE TIE RULE, in one place so it cannot drift between the two search strategies.
 *
 * One subset reaches the best sum: it is accepted, and the caller learns whether that sum
 * was the target ('exact') or fell short of it ('partial').
 *
 * Two or more subsets reach it: NOTHING is accepted. There is no evidence in the data
 * that picks between them, and every available tie-breaker — fewest payments, most
 * recent, largest first — is a coin toss wearing a reason. The wrong side of that coin is
 * a false clear, which is the number this project exists to publish, so the search
 * returns 'ambiguous' with both rivals attached and the invoice is held for a human.
 */
function settle(
  best: number,
  target: number,
  witnesses: readonly string[][],
  method: SearchOutcome['method'],
  nodes: number,
  exhausted: boolean
): SearchOutcome {
  if (exhausted) {
    return { kind: 'exhausted', sum: 0, chosen: [], rivalSum: 0, rivals: [], method, nodes };
  }
  if (witnesses.length >= 2) {
    return {
      kind: 'ambiguous',
      sum: 0,
      chosen: [],
      rivalSum: best,
      rivals: witnesses.slice(0, 2).map((w) => [...w].sort()),
      method,
      nodes,
    };
  }
  const chosen = [...(witnesses[0] ?? [])].sort();
  return {
    kind: best === target ? 'exact' : 'partial',
    sum: best,
    chosen,
    rivalSum: 0,
    rivals: [],
    method,
    nodes,
  };
}
