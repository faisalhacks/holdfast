/**
 * The API adapter layer — the single import surface for UI code.
 *
 * Pages, components and hooks import `api` and the domain types from here. They must never
 * reach into `./adapters/*` or `@/mocks/*` directly, so that swapping the adapter is a
 * one-file change. `npm run check:boundaries` enforces this.
 *
 * The adapter is chosen ONCE, from configuration, at module load. There is no path by
 * which a failing live request falls back to the demo snapshot: a live failure surfaces as
 * an error the UI renders, never as sample data wearing live clothes.
 */

import { config } from "@/lib/config";
import { createLiveAdapter } from "./adapters/live";
import { createMockAdapter } from "./adapters/mock";
import type { HoldfastApi } from "./types";

function createApi(): HoldfastApi {
  switch (config.apiMode) {
    case "live":
      return createLiveAdapter();
    case "mock":
    default:
      return createMockAdapter({ latencyMs: config.mockLatencyMs });
  }
}

export const api: HoldfastApi = createApi();

export * from "./types";
