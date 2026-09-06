// W03 — `pnpm eval`. The entrypoint.
//
// ── EXIT BEHAVIOUR, which is two stages and must not be conflated ────────────
// This command RUNS TO COMPLETION and WRITES eval/report.json. It exits non-zero only on
// a crash or a missing report. It does NOT enforce the floors.
//
// Floor enforcement lives in tools/check-regression.mjs and is gated on eval/floors.live,
// which the orchestrator writes when the Wave 3 merges complete. Enforcing floors here
// would fail every Wave 3 PR for not yet having built the engine that makes the floors
// reachable. The floors are still computed, still recorded in the report, and still
// printed — only the consequence is somebody else's.
//
// ── WHAT IS REPORTED ────────────────────────────────────────────────────────
// Two datasets, both labelled, never substituted for one another:
//   selection — data/, the committed 200. Search and tuning optimise here.
//   holdout   — outside the repository, never committed. THE HEADLINE IS THE HOLDOUT.
// If the holdout is absent, `holdout` is null, the absence is stated, and the run exits 0.
//
// Three systems, scored identically:
//   holdfast    the engine, loaded at runtime through eval/engine-adapter.ts
//   naive_exact the deliberately poor baseline
//   llm_only    the strong LLM-only baseline, behind --llm-baseline, DEFAULT OFF
//
// Usage:
//   pnpm eval
//   pnpm eval -- --llm-baseline [--llm-model=<id>] [--llm-max-calls=N] [--llm-concurrency=N]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { EVAL_DATASETS, HOLD_TYPES, STRATA } from '../lib/types';
import type {
  BaselineReport,
  EvalDatasetName,
  EvalDatasetReport,
  EvalReport,
  EvalTotals,
  FloorResult,
  IsoTimestamp,
  RunId,
} from '../lib/types';
import { holdoutDir, loadDataset, readManifest, type DatasetBundle } from './dataset';
import { evaluateFloors, loadThresholds } from './floors';
import { score, type Scored } from './metrics';
import { loadEngine, runEngineOn } from './engine-adapter';
import { NAIVE_DESCRIPTION, runNaiveExact } from './baselines/naive-exact';
import { LLM_DESCRIPTION, runLlmOnly } from './baselines/llm-only';
import type { SystemOutcome } from './schema';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

/**
 * eval/report.json as it is written.
 *
 * It conforms to `EvalReport` in every respect but one: `holdout` may be null. The
 * contract types the holdout as always present; the brief requires that an absent holdout
 * is reported as null and the run still exits 0. Reporting null is the honest option —
 * the alternative is copying selection figures into the holdout slot, which is the exact
 * substitution the two-dataset split exists to prevent. The widening is here, deliberate,
 * and stated in the report's own notes.
 */
type WrittenReport = Omit<EvalReport, 'holdout'> & { readonly holdout: EvalDatasetReport | null };

// ── arguments ────────────────────────────────────────────────────────────────

interface Options {
  readonly llmBaseline: boolean;
  readonly llmModel: string;
  readonly llmMaxCalls: number | null;
  readonly llmConcurrency: number;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): Options {
  const flag = (name: string): boolean => argv.includes(`--${name}`);
  const value = (name: string): string | null => {
    const prefix = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    if (hit) return hit.slice(prefix.length);
    const idx = argv.indexOf(`--${name}`);
    const next = idx === -1 ? undefined : argv[idx + 1];
    return next !== undefined && !next.startsWith('--') ? next : null;
  };
  const whole = (name: string, fallback: number | null): number | null => {
    const raw = value(name);
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const envModel = process.env['HOLDFAST_LLM_MODEL'];
  return {
    llmBaseline: flag('llm-baseline'),
    llmModel: value('llm-model') ?? (envModel && envModel !== '' ? envModel : 'claude-opus-5'),
    llmMaxCalls: whole('llm-max-calls', null),
    llmConcurrency: whole('llm-concurrency', 4) ?? 4,
    out: value('out') ?? join(REPO_ROOT, 'eval', 'report.json'),
  };
}

// ── formatting ───────────────────────────────────────────────────────────────

const pct = (r: number): string => `${(r * 100).toFixed(1)}%`;

/** Paise to rupees for the console only. Integer arithmetic; the report stays in paise. */
function rupees(p: number): string {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  const whole = Math.trunc(abs / 100);
  const minor = abs % 100;
  return `${sign}Rs ${whole.toLocaleString('en-IN')}.${String(minor).padStart(2, '0')}`;
}

const brand = <T>(v: string): T => v as unknown as T;

/**
 * An entrypoint inside the repository is named relative to it. One outside it — which only
 * happens when $HOLDFAST_ENGINE_ENTRY points elsewhere — is described without its absolute
 * path, so a committed report never carries somebody's home directory.
 */
function describeEntry(entry: string): string {
  return entry.startsWith(REPO_ROOT)
    ? `.${entry.slice(REPO_ROOT.length).split('\\').join('/')}`
    : 'an entrypoint outside the repository, named by $HOLDFAST_ENGINE_ENTRY';
}

// ── running one system over one dataset ──────────────────────────────────────

interface SystemResult {
  readonly name: 'naive_exact' | 'llm_only' | 'holdfast';
  readonly description: string;
  readonly scored: Scored;
  readonly notes: readonly string[];
}

function toDatasetReport(bundle: DatasetBundle, scored: Scored): EvalDatasetReport {
  return {
    dataset: bundle.name,
    row_count: bundle.invoices.length,
    dataset_hash: bundle.hash,
    totals: scored.totals,
    stratification: scored.stratification,
    per_hold_type: scored.per_hold_type,
  };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const notes: string[] = [];

  console.log('HOLDFAST — eval harness\n');

  const thresholds = loadThresholds(join(REPO_ROOT, 'eval', 'thresholds.json'));
  const amountCapPaise = thresholds.values.policy.amount_cap_paise.value;

  const dataDir = join(REPO_ROOT, 'data');
  const manifest = readManifest(dataDir);
  const holdoutRoot = holdoutDir(REPO_ROOT);

  const bundles: Record<EvalDatasetName, DatasetBundle> = {
    selection: loadDataset('selection', dataDir, manifest),
    holdout: loadDataset('holdout', holdoutRoot, manifest),
  };
  for (const name of EVAL_DATASETS) for (const n of bundles[name].notes) notes.push(n);

  if (!bundles.selection.present) {
    notes.push(
      'DEGRADED RUN: data/ is absent or empty, so nothing was measured. Every figure in this ' +
        'report is a zero placeholder and none of it is a result. The harness ran to ' +
        'completion and wrote this file, which is what the eval gate requires of it.'
    );
    console.log('data/ is absent or empty — W02 has not landed the dataset yet.');
    console.log('Running to completion anyway and writing a zeroed report. Nothing here is a result.\n');
  }
  if (!bundles.holdout.present) {
    notes.push(
      `holdout: absent (looked in ${holdoutRoot}; set $HOLDFAST_HOLDOUT_DIR to point elsewhere). ` +
        'Reported as null. Selection figures are NOT substituted for it — the headline is the ' +
        'holdout precisely so that it cannot be.'
    );
  }

  const engine = await loadEngine(REPO_ROOT);
  for (const n of engine.notes) notes.push(`engine: ${n}`);

  // ── run every system over every present dataset ────────────────────────────
  const results = new Map<EvalDatasetName, SystemResult[]>();

  for (const name of EVAL_DATASETS) {
    const bundle = bundles[name];
    const perDataset: SystemResult[] = [];

    const engineRun = await runEngineOn(engine, bundle, thresholds.values.policy);
    perDataset.push({
      name: 'holdfast',
      description: engine.entry
        ? `Holdfast engine, loaded from ${describeEntry(engine.entry)}`
        : 'Holdfast engine — not yet built. Every row is left to a human and coverage is 0.',
      scored: score(bundle, engineRun.outcomes),
      notes: engineRun.notes,
    });

    const naive: readonly SystemOutcome[] = runNaiveExact(bundle);
    perDataset.push({
      name: 'naive_exact',
      description: NAIVE_DESCRIPTION,
      scored: score(bundle, naive),
      notes: [],
    });

    if (options.llmBaseline && bundle.present) {
      console.log(`llm_only: running the strong baseline over the ${name} set (${bundle.invoices.length} call(s), model ${options.llmModel})...`);
      const llm = await runLlmOnly(
        bundle,
        {
          model: options.llmModel,
          maxCalls: options.llmMaxCalls ?? bundle.invoices.length,
          concurrency: options.llmConcurrency,
          cacheDir: join(REPO_ROOT, 'eval', '.cache', 'llm'),
        },
        amountCapPaise
      );
      // A baseline that did not run is absent from the report. Reporting zeros for it
      // would put a measurement-shaped number next to a thing that was never measured.
      if (llm.ran) {
        perDataset.push({
          name: 'llm_only',
          description: LLM_DESCRIPTION,
          scored: score(bundle, llm.outcomes),
          notes: llm.notes,
        });
      } else {
        for (const n of llm.notes) notes.push(n);
      }
    }

    results.set(name, perDataset);
  }

  if (!options.llmBaseline) {
    notes.push(
      'llm_only: not run. The strong LLM baseline is behind --llm-baseline and is off by ' +
        'default so that sweep runs stay fast and deterministic. It is run once, ' +
        'deliberately, for the final report.'
    );
  }

  const pick = (name: EvalDatasetName, system: SystemResult['name']): SystemResult | undefined =>
    (results.get(name) ?? []).find((r) => r.name === system);

  const selectionHoldfast = pick('selection', 'holdfast');
  const holdoutHoldfast = pick('holdout', 'holdfast');
  if (!selectionHoldfast) throw new Error('internal: the selection set produced no system-under-test result');

  for (const name of EVAL_DATASETS) {
    for (const r of results.get(name) ?? []) {
      for (const n of r.notes) notes.push(`${r.name} (${name}): ${n}`);
      for (const n of r.scored.notes) notes.push(`${r.name} (${name}): ${n}`);
    }
  }

  // ── the report ─────────────────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();
  const floors = evaluateFloors(
    selectionHoldfast.scored.totals,
    selectionHoldfast.scored.per_hold_type,
    thresholds.values
  );

  const baselines: BaselineReport[] = [];
  for (const name of EVAL_DATASETS) {
    for (const r of results.get(name) ?? []) {
      baselines.push({
        name: r.name,
        description: `[${name}] ${r.description}`,
        totals: r.scored.totals,
      });
    }
  }

  notes.push(
    'The top-level totals, stratification and per_hold_type mirror the SELECTION set, ' +
      'because tools/check-regression.mjs reads them from the root and must not need to ' +
      'know about the two-dataset layout. The holdout is reported beside them and is the ' +
      'headline. A holdout figure that disagrees with selection is a finding to publish.'
  );
  notes.push(
    'Every entry in `baselines` is prefixed with the dataset it was measured on, because ' +
      'the contract types a baseline by name alone and a comparison against the headline ' +
      'set has to be visible next to it.'
  );
  notes.push(
    'Floors are computed and recorded here. They are NOT enforced by this command: ' +
      'enforcement lives in tools/check-regression.mjs, gated on eval/floors.live. The ' +
      'numbers are identical before and after that trigger; only the consequence changes.'
  );

  if (holdoutHoldfast && bundles.holdout.present) {
    const hf = evaluateFloors(
      holdoutHoldfast.scored.totals,
      holdoutHoldfast.scored.per_hold_type,
      thresholds.values
    );
    for (const f of hf) {
      notes.push(`holdout floor ${f.id}: observed ${f.observed}, threshold ${f.threshold}, ${f.met ? 'met' : 'NOT met'}`);
    }
  }

  const runId = brand<RunId>(
    `run-${createHash('sha256').update(`${generatedAt}${bundles.selection.hash}`).digest('hex').slice(0, 16)}`
  );

  const report: WrittenReport = {
    schema_version: 1,
    dataset_hash: bundles.selection.hash,
    frozen_at: bundles.selection.frozenAt,
    generated_at: brand<IsoTimestamp>(generatedAt),
    dataset_commit: manifest?.commit ?? 'unfrozen',
    run_id: runId,
    thresholds_hash: thresholds.hash,
    totals: selectionHoldfast.scored.totals,
    stratification: selectionHoldfast.scored.stratification,
    per_hold_type: selectionHoldfast.scored.per_hold_type,
    selection: toDatasetReport(bundles.selection, selectionHoldfast.scored),
    holdout:
      bundles.holdout.present && holdoutHoldfast
        ? toDatasetReport(bundles.holdout, holdoutHoldfast.scored)
        : null,
    baselines,
    floors,
    notes,
  };

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!existsSync(options.out)) {
    console.error(`eval: FAIL — the report was not written to ${options.out}`);
    return 1;
  }

  printSummary(report, results, bundles, options, floors);
  console.log(`\neval: report written to ${options.out.replace(REPO_ROOT, '.')}`);
  console.log('eval: floors recorded, NOT enforced here — that is tools/check-regression.mjs.');
  return 0;
}

// ── console summary ──────────────────────────────────────────────────────────

function totalsLine(label: string, t: EvalTotals): string {
  return (
    `  ${label.padEnd(14)} coverage ${pct(t.coverage).padStart(6)}  ` +
    `false clears ${String(t.false_clears).padStart(3)}  ` +
    `at risk ${rupees(t.rupees_at_risk_paise as unknown as number).padStart(18)}  ` +
    `precision ${pct(t.match_precision).padStart(6)}  ` +
    `decided ${String(t.decided_count).padStart(4)}/${t.invoices_total}`
  );
}

function printSummary(
  report: WrittenReport,
  results: Map<EvalDatasetName, SystemResult[]>,
  bundles: Record<EvalDatasetName, DatasetBundle>,
  options: Options,
  floors: readonly FloorResult[]
): void {
  console.log(`\ndataset_hash  ${report.dataset_hash}`);
  console.log(`frozen_at     ${report.frozen_at}${report.frozen_at === '1970-01-01T00:00:00.000Z' ? '  (not frozen)' : ''}`);
  console.log(`commit        ${report.dataset_commit}`);

  for (const name of EVAL_DATASETS) {
    const bundle = bundles[name];
    console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 56 - name.length))}`);
    if (!bundle.present) {
      console.log(`  absent — reported as ${name === 'holdout' ? 'null' : 'zeros'}, not substituted.`);
      continue;
    }
    console.log(`  ${bundle.invoices.length} invoice(s), ${bundle.payments.length} statement line(s), hash ${bundle.hash.slice(0, 12)}`);
    for (const r of results.get(name) ?? []) console.log(totalsLine(r.name, r.scored.totals));

    // The mix is ALWAYS disclosed. Aggregate-only reporting is what we criticise the
    // category for, and we do not get to do it ourselves.
    const holdfast = (results.get(name) ?? []).find((r) => r.name === 'holdfast');
    if (holdfast) {
      console.log('\n  stratification (declared / realised — coverage, false clears, at risk)');
      for (const s of STRATA) {
        const f = holdfast.scored.stratification[s];
        console.log(
          `    ${s.padEnd(12)} ${String(f.declared_count).padStart(4)} / ${String(f.realised_count).padStart(4)}` +
            `   ${pct(f.coverage).padStart(6)}  ${String(f.false_clears).padStart(3)}  ` +
            `${rupees(f.rupees_at_risk_paise as unknown as number).padStart(18)}`
        );
      }
      const exercised = HOLD_TYPES.filter((t) => holdfast.scored.per_hold_type[t].expected_count > 0);
      if (exercised.length > 0) {
        console.log('\n  per hold type (expected / applied / correct — recall, precision)');
        for (const t of exercised) {
          const f = holdfast.scored.per_hold_type[t];
          console.log(
            `    ${t.padEnd(22)} ${String(f.expected_count).padStart(3)} / ${String(f.applied_count).padStart(3)} / ` +
              `${String(f.correct_count).padStart(3)}   ${pct(f.recall).padStart(6)}  ${pct(f.precision).padStart(6)}`
          );
        }
      }
    }
  }

  // ── what the poor baseline actually costs, in numbers ──────────────────────
  const naiveOn = (name: EvalDatasetName): SystemResult | undefined =>
    (results.get(name) ?? []).find((r) => r.name === 'naive_exact');
  const headlineSet: EvalDatasetName = bundles.holdout.present ? 'holdout' : 'selection';
  const naive = naiveOn(headlineSet);
  if (naive && bundles[headlineSet].present) {
    const t = naive.scored.totals;
    console.log(`\n── the deliberately poor baseline, on the ${headlineSet} set ${'─'.repeat(20)}`);
    console.log(
      `  naive_exact cleared ${t.auto_cleared_count} invoice(s) and got ${t.correct_auto_clears} of them right.`
    );
    console.log(
      `  ${t.false_clears} false clear(s), ${rupees(t.rupees_at_risk_paise as unknown as number)} at risk, ` +
        `match precision ${pct(t.match_precision)}.`
    );
    console.log(
      `  It applied ${t.held_count} typed hold(s) and emitted ${t.conflicts_emitted} conflict(s): ` +
        'every per-hold-type recall is 0 and it can never say "stop".'
    );
    console.log('  A coverage number alone does not separate this from a working system. The');
    console.log('  false-clear count and the rupees do, which is why both are in the report.');
  }

  // ── the headline ──────────────────────────────────────────────────────────
  console.log(`\n── headline ${'─'.repeat(52)}`);
  if (report.holdout) {
    const t = report.holdout.totals;
    console.log('  Reported from the HOLDOUT, which lives outside the repository and is never');
    console.log('  committed. Selection figures are never substituted for it.');
    console.log(
      `  coverage ${pct(t.coverage)} against the ~70% industry plateau; ` +
        `${t.false_clears} false clear(s); ${rupees(t.rupees_at_risk_paise as unknown as number)} at risk.`
    );
  } else {
    console.log('  No holdout was found, so there is no headline. `holdout` is null in the report');
    console.log('  and the selection figures below are NOT a substitute for it.');
    const t = report.totals;
    console.log(
      `  selection only: coverage ${pct(t.coverage)}, ${t.false_clears} false clear(s), ` +
        `${rupees(t.rupees_at_risk_paise as unknown as number)} at risk.`
    );
  }

  console.log('\n── floors (recorded against the selection set, not enforced here) ──');
  for (const f of floors) {
    console.log(`  ${f.met ? 'met    ' : 'NOT met'}  ${f.id.padEnd(34)} observed ${f.observed}  threshold ${f.threshold}`);
  }

  if (!options.llmBaseline) {
    console.log('\n  llm_only was not run: it is behind --llm-baseline and off by default so that');
    console.log('  sweep runs stay fast and deterministic. Run `pnpm eval -- --llm-baseline` once.');
  }
}

main()
  .then((code) => { process.exit(code); })
  .catch((err: unknown) => {
    console.error('\neval: FAIL — the harness crashed before writing a report.\n');
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
