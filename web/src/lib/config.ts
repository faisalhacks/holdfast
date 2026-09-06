/**
 * Runtime configuration.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so they are read here once rather than
 * scattered through the app.
 */

export type ApiMode = "mock" | "live";

function readApiMode(): ApiMode {
  const raw = process.env.NEXT_PUBLIC_HOLDFAST_API_MODE?.trim().toLowerCase();
  return raw === "live" ? "live" : "mock";
}

function readLatency(): number {
  const raw = Number(process.env.NEXT_PUBLIC_HOLDFAST_MOCK_LATENCY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 220;
}

/** Origin of the Holdfast API. Empty string means same-origin. */
function readBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_HOLDFAST_API_BASE_URL?.trim() ?? "";
  return raw.replace(/\/+$/, "");
}

export const config = {
  /** Which adapter the console is wired to. Defaults to `mock`. */
  apiMode: readApiMode(),
  /** Origin the live adapter fetches from. */
  apiBaseUrl: readBaseUrl(),
  /** Artificial latency for the mock adapter, so loading states are real. */
  mockLatencyMs: readLatency(),
  /** The run the queue and the run overview read. */
  currentRunId: process.env.NEXT_PUBLIC_HOLDFAST_RUN_ID?.trim() || "run_engine_a",
  /**
   * The reviewer this browser session acts as.
   *
   * The backend requires a named human on every decision and requires the approval header
   * to repeat that same name. There is no sign-in in this console, so the identity is
   * configured rather than authenticated — and the UI says so wherever it is used.
   */
  reviewerId: process.env.NEXT_PUBLIC_HOLDFAST_REVIEWER_ID?.trim() || "rev_console",
} as const;
