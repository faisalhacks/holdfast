/**
 * MOCK ADAPTER STATE — DEMO ONLY.
 *
 * A module-level, in-memory dataset seeded from `@/mocks/fixtures`. Writes made
 * through the mock adapter mutate this object, so decisions survive client-side
 * navigation but are lost on a full page reload. Nothing is persisted and no
 * request leaves the browser.
 *
 * This module is the only consumer of the fixtures directory.
 */

import { buildDemoDataset, type DemoDataset } from "@/mocks/fixtures";

let dataset: DemoDataset | null = null;

export function getDataset(): DemoDataset {
  if (!dataset) {
    dataset = buildDemoDataset(new Date());
  }
  return dataset;
}

/** Discards all mock mutations and re-seeds from fixtures. */
export function resetDataset(): void {
  dataset = null;
}

export function findException(id: string) {
  return getDataset().exceptions.find(
    (exception) => exception.id === id || exception.reference === id,
  );
}

let sequence = 0;

/** Deterministic-enough id generator for mock-created records. */
export function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_mock${sequence.toString().padStart(3, "0")}`;
}
