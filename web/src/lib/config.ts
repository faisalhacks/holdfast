/**
 * Runtime configuration.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so they are read here once
 * rather than scattered through the app.
 */

export type ApiMode = "mock" | "live";

function readApiMode(): ApiMode {
  const raw = process.env.NEXT_PUBLIC_SYNDICATE_API_MODE?.trim().toLowerCase();
  return raw === "live" ? "live" : "mock";
}

function readLatency(): number {
  const raw = Number(process.env.NEXT_PUBLIC_SYNDICATE_MOCK_LATENCY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 220;
}

export const config = {
  /** Which API adapter the app is wired to. Defaults to `mock`. */
  apiMode: readApiMode(),
  /** Artificial latency for the mock adapter, so loading states are real. */
  mockLatencyMs: readLatency(),
  currentRunId: process.env.NEXT_PUBLIC_SYNDICATE_RUN_ID?.trim() || "run_demo_7f31",
} as const;
