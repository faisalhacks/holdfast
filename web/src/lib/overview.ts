/**
 * Overview derivations.
 *
 * Pure functions over rows the API already returned. Nothing here reads a
 * network, invents a value, or fills a gap: a null exposure stays null and is
 * reported as "not recorded" rather than folded into a sum as zero, and every
 * caller is expected to state the set these were counted over.
 *
 * Money stays integer paise throughout. It becomes a decimal only in
 * `formatMoney`, at the DOM.
 */

import type { ExceptionCategory, ExceptionSummary, Severity } from "@/lib/api";

export interface Grouped<K extends string> {
  key: K;
  /** Sum of the exposures that were recorded, in paise. */
  exposure_paise: number;
  /** How many rows fell in this group. */
  count: number;
  /** How many of those carried no exposure figure at all. */
  withoutExposure: number;
}

function group<K extends string>(
  items: ExceptionSummary[],
  keyOf: (item: ExceptionSummary) => K,
): Map<K, Grouped<K>> {
  const out = new Map<K, Grouped<K>>();
  for (const item of items) {
    const key = keyOf(item);
    const entry = out.get(key) ?? { key, exposure_paise: 0, count: 0, withoutExposure: 0 };
    entry.count += 1;
    if (item.exposure_paise === null) entry.withoutExposure += 1;
    else entry.exposure_paise += item.exposure_paise;
    out.set(key, entry);
  }
  return out;
}

/** Money at risk per exception category, largest first. */
export function byCategory(items: ExceptionSummary[]): Grouped<ExceptionCategory>[] {
  return [...group(items, (item) => item.category).values()].sort(
    (a, b) => b.exposure_paise - a.exposure_paise || b.count - a.count,
  );
}

/** Counts per severity, in fixed severity order so the shape is comparable. */
const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export function bySeverity(items: ExceptionSummary[]): Grouped<Severity>[] {
  const found = group(items, (item) => item.severity);
  return SEVERITY_ORDER.map(
    (key) => found.get(key) ?? { key, exposure_paise: 0, count: 0, withoutExposure: 0 },
  );
}

export type SlaBucketKey = "breached" | "under_4h" | "under_24h" | "beyond_24h";

export const SLA_BUCKET_LABELS: Record<SlaBucketKey, string> = {
  breached: "Breached",
  under_4h: "Under 4 hours",
  under_24h: "Under 24 hours",
  beyond_24h: "Beyond 24 hours",
};

const SLA_ORDER: SlaBucketKey[] = ["breached", "under_4h", "under_24h", "beyond_24h"];

const HOUR = 3_600_000;

function bucketOf(slaDueAt: string, from: number): SlaBucketKey | null {
  const due = new Date(slaDueAt).getTime();
  if (Number.isNaN(due)) return null;
  const remaining = due - from;
  if (remaining < 0) return "breached";
  if (remaining < 4 * HOUR) return "under_4h";
  if (remaining < 24 * HOUR) return "under_24h";
  return "beyond_24h";
}

/**
 * Time remaining against each row's SLA target, in four buckets.
 *
 * A row whose `slaDueAt` cannot be read is counted nowhere and reported
 * separately by the caller, rather than being quietly filed under "beyond".
 */
export function bySlaBucket(
  items: ExceptionSummary[],
  from: number = Date.now(),
): { buckets: Grouped<SlaBucketKey>[]; undated: number } {
  const found = new Map<SlaBucketKey, Grouped<SlaBucketKey>>();
  let undated = 0;

  for (const item of items) {
    const key = bucketOf(item.slaDueAt, from);
    if (key === null) {
      undated += 1;
      continue;
    }
    const entry = found.get(key) ?? { key, exposure_paise: 0, count: 0, withoutExposure: 0 };
    entry.count += 1;
    if (item.exposure_paise === null) entry.withoutExposure += 1;
    else entry.exposure_paise += item.exposure_paise;
    found.set(key, entry);
  }

  const buckets = SLA_ORDER.map(
    (key) => found.get(key) ?? { key, exposure_paise: 0, count: 0, withoutExposure: 0 },
  );
  return { buckets, undated };
}

/** The largest value in a set, for scaling bars. Never returns zero. */
export function peak(values: number[]): number {
  return Math.max(1, ...values);
}
