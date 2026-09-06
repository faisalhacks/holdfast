/**
 * The API adapter layer — the single import surface for UI code.
 *
 * Pages, components, and hooks import `api` and the domain types from here.
 * They must never reach into `./adapters/*` or `@/mocks/*` directly, so that
 * swapping the adapter is a one-file change. `npm run check:boundaries`
 * enforces this.
 */

import { config } from "@/lib/config";
import { createLiveAdapter } from "./adapters/live";
import { createMockAdapter } from "./adapters/mock";
import type { SyndicateApi } from "./types";

function createApi(): SyndicateApi {
  switch (config.apiMode) {
    case "live":
      return createLiveAdapter();
    case "mock":
    default:
      return createMockAdapter({ latencyMs: config.mockLatencyMs });
  }
}

export const api: SyndicateApi = createApi();

export * from "./types";
