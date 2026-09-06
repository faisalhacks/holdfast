// W03 — the system under test.
//
// The harness is built by a worker who may not READ engine/. That is the point: the thing
// that judges the engine must not be shaped by the engine's internals. So the engine is
// loaded at RUNTIME, through the interface below, and the harness never imports it
// statically and never inspects it.
//
// ── THE INTERFACE THE ENGINE PLUGS INTO ──────────────────────────────────────
// Export, from engine/run.ts (or engine/index.ts, or whatever $HOLDFAST_ENGINE_ENTRY
// names), any one of `runEngine`, `run`, or a default export:
//
//   export function runEngine(input: {
//     invoices: Invoice[];              // as loaded from the dataset, contract shape
//     payments: Payment[];
//     thresholds: unknown;              // the parsed eval/thresholds.json policy block
//   }): Promise<EngineDecision[]> | EngineDecision[];
//
//   interface EngineDecision {
//     invoice_id: string;
//     action: 'auto_clear' | 'hold' | 'unmatched';
//     payment_ids?: string[];           // the settling set, exactly; [] otherwise
//     hold_type?: HoldType | null;      // required when action is 'hold'
//     requires_human?: boolean;         // false only when no named person must act
//     conflicts?: Conflict[];           // at least one on every hold
//   }
//
// Every field is validated before it is scored (eval/schema.ts). Ids that are not in the
// ledger are dropped rather than trusted, extra keys are ignored, and a missing decision
// counts as a row left to a human. Nothing here repairs a system's output to flatter it.
//
// Until an engine exists, the system under test decides nothing and coverage is 0. That is
// the true state of the build, and it is reported as such rather than borrowed from a
// baseline.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatasetBundle } from './dataset';
import { parseSystemOutcomes, type SystemOutcome } from './schema';

export interface EngineLoad {
  readonly entry: string | null;
  readonly run: ((input: unknown) => unknown) | null;
  readonly notes: readonly string[];
}

function candidatePaths(repoRoot: string): string[] {
  const fromEnv = process.env['HOLDFAST_ENGINE_ENTRY'];
  const paths = fromEnv && fromEnv.trim() !== '' ? [fromEnv.trim()] : [];
  return [
    ...paths,
    join(repoRoot, 'engine', 'run.ts'),
    join(repoRoot, 'engine', 'index.ts'),
    join(repoRoot, 'engine', 'run.mjs'),
  ];
}

export async function loadEngine(repoRoot: string): Promise<EngineLoad> {
  const notes: string[] = [];
  for (const entry of candidatePaths(repoRoot)) {
    if (!existsSync(entry)) continue;
    try {
      const mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
      const fn = mod['runEngine'] ?? mod['run'] ?? mod['default'];
      if (typeof fn === 'function') {
        return { entry, run: fn as (input: unknown) => unknown, notes };
      }
      notes.push(`${entry} loaded but exports no runEngine/run/default function`);
    } catch (err) {
      notes.push(`${entry} failed to load: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  notes.push(
    'no engine entrypoint found (looked for $HOLDFAST_ENGINE_ENTRY, engine/run.ts, ' +
      'engine/index.ts). The system under test decided nothing: coverage 0, and the ' +
      'figures below are the state of the build, not a measurement of a matcher.'
  );
  return { entry: null, run: null, notes };
}

export interface EngineRun {
  readonly outcomes: readonly SystemOutcome[];
  readonly notes: readonly string[];
  readonly ran: boolean;
}

export async function runEngineOn(
  loaded: EngineLoad,
  bundle: DatasetBundle,
  policy: unknown
): Promise<EngineRun> {
  const notes: string[] = [];
  if (!loaded.run) return { outcomes: [], notes, ran: false };

  let raw: unknown;
  try {
    raw = await loaded.run({
      // The UNNARROWED rows. `bundle.invoices` is the projection this harness validates
      // and scores; the engine needs fields the harness never looks at. Passing the
      // projection would silently starve the engine of net_paise, the tax breakdown and
      // the dates, and it would report the resulting zero as the system's coverage.
      invoices: bundle.rawInvoices.length > 0 ? bundle.rawInvoices : bundle.invoices,
      payments: bundle.rawPayments.length > 0 ? bundle.rawPayments : bundle.payments,
      thresholds: policy,
      dataset: bundle.name,
    });
  } catch (err) {
    notes.push(`engine threw on the ${bundle.name} set: ${(err as Error).message.slice(0, 200)}`);
    return { outcomes: [], notes, ran: false };
  }

  const parsed = parseSystemOutcomes(
    raw,
    new Set(bundle.invoices.map((i) => String(i.id))),
    new Set(bundle.payments.map((p) => String(p.id)))
  );
  for (const p of parsed.problems) notes.push(`engine (${bundle.name}): ${p}`);
  return { outcomes: parsed.outcomes, notes, ran: true };
}
