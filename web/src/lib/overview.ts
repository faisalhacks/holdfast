import type { ConflictSeverity, QueueCase } from "@/lib/api";

export interface CountGroup<K extends string> { key: K; count: number }

const SEVERITY_ORDER: ConflictSeverity[] = ["blocking", "material", "advisory"];

export function bySeverity(items: readonly QueueCase[]): CountGroup<ConflictSeverity>[] {
  const counts = new Map<ConflictSeverity, number>();
  for (const item of items) {
    if (item.severity) counts.set(item.severity, (counts.get(item.severity) ?? 0) + 1);
  }
  return SEVERITY_ORDER.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

export type AgeBucketKey = "today" | "one_to_seven" | "eight_to_thirty" | "over_thirty";
export const AGE_BUCKET_LABELS: Record<AgeBucketKey, string> = {
  today: "Held today",
  one_to_seven: "1–7 days",
  eight_to_thirty: "8–30 days",
  over_thirty: "Over 30 days",
};

const AGE_ORDER: AgeBucketKey[] = ["today", "one_to_seven", "eight_to_thirty", "over_thirty"];

function ageBucket(days: number): AgeBucketKey {
  if (days <= 0) return "today";
  if (days <= 7) return "one_to_seven";
  if (days <= 30) return "eight_to_thirty";
  return "over_thirty";
}

export function byAge(items: readonly QueueCase[]): CountGroup<AgeBucketKey>[] {
  const counts = new Map<AgeBucketKey, number>();
  for (const item of items) {
    const key = ageBucket(item.age_days);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return AGE_ORDER.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

export function peak(values: readonly number[]): number {
  return Math.max(1, ...values);
}
