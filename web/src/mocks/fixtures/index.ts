/**
 * DEMO FIXTURES — a recorded snapshot of the frozen backend.
 *
 * `snapshot.json` is not hand-written. It is the verbatim `data` payload of six real calls
 * against the backend at v1.0-submission running on its in-memory repository:
 *
 *   GET /api/runs/run_engine_a
 *   GET /api/runs/run_engine_a/queue?limit=200&offset=0
 *   GET /api/cases/{caseId}   for each of the eight cases in that queue
 *   GET /api/audit?run_id=run_engine_a&limit=200
 *
 * Recording it rather than inventing it is the point: the mock adapter then exercises the
 * same mappers, the same enum members and the same money encoding as the live adapter, so
 * a shape that works in demo mode works against the backend. Nothing here is a value the
 * backend would not produce.
 *
 * Re-record it with `npm run fixtures:record` while the backend is running.
 */

import snapshot from "./snapshot.json";

export interface BackendSnapshot {
  readonly captured_from: string;
  readonly run_id: string;
  readonly run: unknown;
  readonly queue: unknown;
  readonly cases: Readonly<Record<string, unknown>>;
  readonly audit: unknown;
}

export function loadSnapshot(): BackendSnapshot {
  return snapshot as unknown as BackendSnapshot;
}
