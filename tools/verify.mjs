// Orchestrator-owned. `pnpm verify` — every gate, in order, with a summary.
//
// This is the termination condition. The orchestrator does not declare the build done
// because a demo ran; it declares it done because this is fully green.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BIN = join(ROOT, 'node_modules', '.bin');
const isWin = process.platform === 'win32';

const has = (p) => existsSync(join(ROOT, p));

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  return r.status === null ? 1 : r.status;
}

const node = (script) => () => run(process.execPath, [join('tools', script)]);

// A step may declare a precondition. `skipWhen` is for work that genuinely does not exist
// yet; `requiredOnce` closes the hole — the moment the artefact exists, the step is
// mandatory and can no longer be skipped by deleting a file.
const STEPS = [
  { name: 'selftest', run: node('selftest.mjs') },
  {
    name: 'typecheck',
    run: () => run(join(BIN, isWin ? 'tsc.cmd' : 'tsc'), ['--noEmit']),
    skipWhen: () => (has('node_modules') ? null : 'dependencies not installed'),
  },
  { name: 'forbidden', run: node('check-forbidden.mjs') },
  { name: 'ownership', run: node('check-ownership.mjs') },
  { name: 'manifest', run: node('verify-manifest.mjs') },
  { name: 'thresholds', run: node('verify-thresholds.mjs') },
  {
    name: 'migrations',
    run: node('migrate.mjs'),
    skipWhen: () =>
      !has('db/migrations') ? 'db/migrations/ does not exist yet'
      : !process.env.DATABASE_URL ? 'DATABASE_URL not set (start Postgres to run this locally)'
      : null,
  },
  {
    name: 'eval',
    run: () => run(join(BIN, isWin ? 'tsx.cmd' : 'tsx'), [join('eval', 'run.ts')]),
    // AMENDMENT 01 §6: the trigger must sit outside every worker's glob, or W03 — who
    // owns eval/** — could make a red eval skip again by deleting the file the gate keys
    // on. The trigger is data/MANIFEST: frozen, orchestrator-written once at the Wave 2
    // freeze, and one-way. It appears at exactly the moment an eval becomes meaningful —
    // there is a dataset, and it can no longer change. After that the eval is mandatory
    // and nobody in the build can turn it off.
    requiredOnce: () => has('data/MANIFEST'),
    missing: () => !has('eval/run.ts'),
    skipWhen: () => (has('data/MANIFEST') ? null : 'dataset not frozen yet (pre-Wave-2 gate)'),
  },
  {
    name: 'regression',
    run: node('check-regression.mjs'),
    skipWhen: () => (has('eval/report.json') ? null : 'no eval/report.json yet'),
  },
  { name: 'audit:claims', run: node('audit-claims.mjs') },
];

console.log('HOLDFAST — pnpm verify\n');

const results = [];
for (const step of STEPS) {
  if (step.requiredOnce && step.requiredOnce() && step.missing && step.missing()) {
    console.log(`\n── ${step.name} ${'─'.repeat(Math.max(0, 60 - step.name.length))}`);
    console.error('FAIL — the dataset is frozen but eval/run.ts does not exist. The eval gate');
    console.error('is not optional once the dataset is frozen. Restore it; do not route around it.');
    results.push({ name: step.name, status: 'FAIL' });
    continue;
  }
  const skip = step.skipWhen && step.skipWhen();
  if (skip) {
    results.push({ name: step.name, status: 'skip', note: skip });
    continue;
  }
  console.log(`\n── ${step.name} ${'─'.repeat(Math.max(0, 60 - step.name.length))}`);
  const code = step.run();
  results.push({ name: step.name, status: code === 0 ? 'pass' : 'FAIL' });
}

console.log(`\n${'═'.repeat(64)}\n`);
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  const mark = r.status === 'pass' ? 'pass' : r.status === 'skip' ? 'skip' : 'FAIL';
  console.log(`  ${r.name.padEnd(width)}  ${mark}${r.note ? `  — ${r.note}` : ''}`);
}

const failures = results.filter((r) => r.status === 'FAIL');
const skipped = results.filter((r) => r.status === 'skip');

console.log('');
if (failures.length) {
  console.log(`verify: ${failures.length} FAILING — ${failures.map((f) => f.name).join(', ')}`);
  console.log('A red build is not done. Fix it; never disable the check.');
  process.exit(1);
}
if (skipped.length) {
  console.log(`verify: green, with ${skipped.length} step(s) not yet applicable.`);
  console.log('Not the termination condition — that requires every step green.');
  process.exit(0);
}
console.log('verify: fully green.');
process.exit(0);
