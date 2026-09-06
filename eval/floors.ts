// W03 — eval harness. The floors are READ here and RECORDED. They are not enforced here.
//
// Floor enforcement lives in tools/check-regression.mjs and is gated on eval/floors.live,
// which the orchestrator writes once the Wave 3 merges complete. This is deliberate and it
// is not a softening: at the Wave 2 freeze there is a dataset and a harness but no engine,
// and enforcing floors here would fail every Wave 3 PR for not yet having built the thing
// that makes the floors reachable. The same numbers are computed either way — only the
// consequence changes, and the consequence is somebody else's to apply.
//
// eval/thresholds.json is FROZEN and is read, never written. Widening a floor to make a
// run pass is quarantine Q2: the same move the incumbent ERP calls "change the tolerance",
// refused here for the same reason. This file has no write path to it, by construction.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { HOLD_TYPES } from '../lib/types';
import type { EvalTotals, FloorResult, PerHoldTypeMap, Sha256 } from '../lib/types';

const floorValue = z.object({ value: z.number(), why: z.string().optional() }).passthrough();

const thresholdsSchema = z
  .object({
    floors: z.object({
      coverage_min: floorValue,
      false_clears_max: floorValue,
      match_precision_min: floorValue,
      rupees_at_risk_max_paise: floorValue,
      per_hold_type_recall_min: floorValue,
      conflicts_per_held_invoice_min: floorValue,
    }),
    regression: z.object({ max_false_clear_rate_worsening: floorValue }).passthrough(),
    policy: z
      .object({
        amount_cap_paise: floorValue,
        date_window_days: floorValue,
        max_subset_size: floorValue,
      })
      .passthrough(),
  })
  .passthrough();

export type Thresholds = z.infer<typeof thresholdsSchema>;

export interface LoadedThresholds {
  readonly values: Thresholds;
  readonly hash: Sha256;
}

export function loadThresholds(path: string): LoadedThresholds {
  if (!existsSync(path)) {
    throw new Error(`eval/thresholds.json is missing at ${path}. It is authored at Wave 0 and frozen; restore it from git.`);
  }
  const bytes = readFileSync(path);
  const parsed = thresholdsSchema.safeParse(JSON.parse(bytes.toString('utf8')));
  if (!parsed.success) {
    throw new Error(`eval/thresholds.json does not match the expected shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  return {
    values: parsed.data,
    hash: createHash('sha256').update(bytes).digest('hex') as unknown as Sha256,
  };
}

const atLeast = (id: string, observed: number, threshold: number): FloorResult => ({
  id,
  threshold,
  observed,
  met: observed >= threshold,
});

const atMost = (id: string, observed: number, threshold: number): FloorResult => ({
  id,
  threshold,
  observed,
  met: observed <= threshold,
});

/**
 * Every floor, evaluated against one dataset's totals. Recorded in the report whether met
 * or not — "whatever the number is at the end, it ships".
 */
export function evaluateFloors(
  totals: EvalTotals,
  perHoldType: PerHoldTypeMap,
  thresholds: Thresholds
): readonly FloorResult[] {
  const f = thresholds.floors;
  const results: FloorResult[] = [
    atLeast('coverage_min', totals.coverage, f.coverage_min.value),
    atMost('false_clears_max', totals.false_clears, f.false_clears_max.value),
    atLeast('match_precision_min', totals.match_precision, f.match_precision_min.value),
    atMost('rupees_at_risk_max_paise', totals.rupees_at_risk_paise, f.rupees_at_risk_max_paise.value),
  ];

  // A hold with no conflict is a policy bug. With no holds at all the floor is vacuously
  // met, so the sharper number is reported beside it and lives in totals as well.
  results.push({
    id: 'conflicts_per_held_invoice_min',
    threshold: f.conflicts_per_held_invoice_min.value,
    observed: totals.conflicts_per_held_invoice,
    met: totals.held_count === 0 || totals.conflicts_per_held_invoice >= f.conflicts_per_held_invoice_min.value,
  });
  results.push(atMost('held_invoices_without_conflict', totals.held_invoices_without_conflict, 0));

  // Per hold type, never aggregate. Types truth does not exercise are skipped rather than
  // scored 0 — a recall over an empty denominator is not a finding.
  for (const t of HOLD_TYPES) {
    const figures = perHoldType[t];
    if (figures.expected_count === 0) continue;
    results.push(atLeast(`per_hold_type_recall_min.${t}`, figures.recall, f.per_hold_type_recall_min.value));
  }

  return results;
}
