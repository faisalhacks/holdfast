// Orchestrator-owned. Self-tests for the gate machinery itself.
//
// The gates are the only thing standing between an autonomous build and a dishonest one,
// so they get tested like production code. Two failure modes matter equally:
// a rule that never fires (decorative), and a rule that fires on benign code (gets
// disabled by the third worker who trips it).
//
// Run: node tools/selftest.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { matches, matchesAny } from './_glob.mjs';
import { RULES } from './check-forbidden.mjs';

const GATE = new URL('check-forbidden.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let failed = 0;
const eq = (got, want, label) => {
  if (got !== want) { failed++; console.log(`  FAIL  ${label}\n        want ${want}, got ${got}`); }
};

// ── glob matcher ────────────────────────────────────────────────────────────────
console.log('glob matcher');
const globCases = [
  ['app/(ui)/queue/page.tsx', 'app/(ui)/queue/**', true],
  ['app/(ui)/queue/a/b/c.tsx', 'app/(ui)/queue/**', true],
  ['app/(ui)/exceptions/x.tsx', 'app/(ui)/queue/**', false],
  ['engine/normalise/a/b.ts', 'engine/normalise/**', true],
  ['engine/normalise/b.ts', 'engine/normalise/**', true],
  ['engine/holds/x.ts', 'engine/normalise/**', false],
  ['lib/types.ts', 'lib/types.ts', true],
  ['lib/other.ts', 'lib/types.ts', false],
  ['.github/workflows/ci.yml', '.github/**', true],
  ['tools/freeze.mjs', 'tools/**', true],
  ['data/MANIFEST', 'data/MANIFEST', true],
  ['scripts/gen.ts', 'scripts/**', true],
  ['app/api/runs/route.ts', 'app/api/**', true],
  ['app/api/runs/route.ts', 'app/(ui)/queue/**', false],
];
for (const [p, g, want] of globCases) eq(matches(p, g), want, `${p} ~ ${g}`);

// ── forbidden-pattern rules: each must fire on a real violation, and stay quiet
//    on the benign line a worker would plausibly write next to it ────────────────
console.log('\nforbidden rules — positive (must fire) and negative (must not)');
const FIXTURES = {
  'money-float': {
    bad: ['const amount = parseFloat(row.amount);'],
    good: ['const amount = BigInt(row.amount_paise);'],
  },
  'money-number-cast': {
    bad: ['const total = Number(row.amount);', 'const t = Number(invoiceTotal);'],
    good: ['const port = Number(process.env.PORT);', 'const n = Number(row.line_count);'],
  },
  'append-only-delete': {
    bad: ['DELETE FROM invoices WHERE id = $1', 'deleted_at TIMESTAMPTZ', 'DROP TABLE holds;'],
    good: ['SELECT * FROM invoices WHERE id = $1', 'released_at TIMESTAMPTZ'],
  },
  'append-only-orm-delete': {
    bad: ['await db.delete(invoices);'],
    good: ['await db.insert(invoices).values(row);'],
  },
  'ui-metric-literal': {
    bad: ['<span>99.4</span>', '<td>70.5%</td>'],
    good: ['<span>{totals.coverage}</span>', 'padding: 12.5px;', 'line-height: 1.5;'],
  },
  'firewall-import': {
    bad: ["import { generate } from '../scripts/generate';", "const g = require('./scripts/gen');"],
    good: ["import { normalise } from './normalise';", "import { holds } from '../holds';"],
  },
  'firewall-truth': {
    bad: ["readFileSync('data/truth.json')", "const t = await load('../data/truth.json');"],
    good: ["readFileSync('data/invoices.json')", "const p = await load('../data/payments.json');"],
  },
  'payment-execution': {
    bad: ['executePayment(invoice);', 'await sendPaymentBatch(rows);'],
    good: ['renderPaymentStatus(invoice);', 'releaseHold(holdId, reviewer, reason);'],
  },
  'model-confidence': {
    bad: ['self_reported_confidence: number;', 'const c = model_confidence;'],
    good: ['score_breakdown: ScoreBreakdown;', 'const c = composite;'],
  },
  'overclaim': {
    bad: ['We are SOC 2 compliant.', 'The system continuously learns from reviewers.'],
    good: ['We publish a false-clear count.', 'Audit-ready logging of every decision.'],
  },
  'learning-vocabulary': {
    bad: ['the model learns from each correction'],
    good: ['feedback rules persist vendor mappings'],
  },
};

const byId = new Map(RULES.map((r) => [r.id, r]));

// Every rule must have fixtures. A rule added without a test is a rule nobody verified.
for (const r of RULES) {
  if (!FIXTURES[r.id]) { failed++; console.log(`  FAIL  rule "${r.id}" has no fixtures`); }
}
for (const id of Object.keys(FIXTURES)) {
  if (!byId.has(id)) { failed++; console.log(`  FAIL  fixture "${id}" has no matching rule`); }
}

for (const [id, fx] of Object.entries(FIXTURES)) {
  const rule = byId.get(id);
  if (!rule) continue;
  for (const line of fx.bad) eq(rule.pattern.test(line), true, `[${id}] should fire: ${line}`);
  for (const line of fx.good) eq(rule.pattern.test(line), false, `[${id}] should NOT fire: ${line}`);
}

// ── ownership precedence: a frozen path is denied even inside the worker's own glob ──
console.log('\nownership precedence (frozen beats scope)');
{
  const cfg = JSON.parse(readFileSync(new URL('../.github/ownership.json', import.meta.url), 'utf8'));
  // data/MANIFEST sits inside W02's data/** glob. It must still be denied to W02.
  eq(matchesAny('data/MANIFEST', cfg.frozen), true, 'data/MANIFEST is frozen');
  eq(matchesAny('data/MANIFEST', cfg.workers['W02-data-generator']), true, 'data/MANIFEST is inside W02 scope');
  eq((cfg.frozen_exceptions['W02-data-generator'] || []).length, 0, 'W02 has no frozen exception');
  // truth.json is W02's to write and must NOT be frozen, or its author cannot create it.
  eq(matchesAny('data/truth.json', cfg.frozen), false, 'data/truth.json is not frozen');
  eq(matchesAny('data/truth.json', cfg.workers['W02-data-generator']), true, 'data/truth.json is W02 writable');
  // The eval trigger must sit outside every worker glob it could be deleted from.
  eq(matchesAny('eval/floors.live', cfg.frozen), true, 'eval/floors.live is frozen');
  eq(matchesAny('eval/thresholds.json', cfg.frozen), true, 'eval/thresholds.json is frozen');
}

// ── rule scoping: llm/** may evict from an in-memory cache; db/** may not ────────
console.log('\nrule scoping');
const ormDelete = byId.get('append-only-orm-delete');
eq(matchesAny('llm/cache.ts', ormDelete.include), false, 'llm/** exempt from orm-delete rule');
eq(matchesAny('db/queries.ts', ormDelete.include), true, 'db/** subject to orm-delete rule');
eq(matchesAny('engine/holds/apply.ts', ormDelete.include), true, 'engine/** subject to orm-delete rule');

// ── TEST 2 of 3 (AMENDMENT 01 §2): the firewall positive test ───────────────────
// A fixture importing from `scripts/` inside `engine/` must make the gate exit non-zero,
// end to end — not merely match a regex in isolation. A firewall never observed to fail
// is not evidence of a firewall. The mirror case must exit zero, or the gate is just
// failing everything and proving nothing.
console.log('\nfirewall (end-to-end against the real gate)');

function runGateOn(files) {
  const dir = mkdtempSync(join(tmpdir(), 'holdfast-firewall-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, body, 'utf8');
    }
    const r = spawnSync(process.execPath, [GATE, '--root', dir], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const leak = runGateOn({
  'engine/match/leak.ts': "import { generate } from '../../scripts/generate';\nexport const x = generate;\n",
});
eq(leak.code !== 0, true, 'engine/ importing from scripts/ must fail the gate');
eq(/firewall-import/.test(leak.out), true, 'failure must name the firewall-import rule');

const truthLeak = runGateOn({
  'engine/match/peek.ts': "import truth from '../../data/truth.json';\nexport const t = truth;\n",
});
eq(truthLeak.code !== 0, true, 'engine/ reading truth.json must fail the gate');
eq(/firewall-truth/.test(truthLeak.out), true, 'failure must name the firewall-truth rule');

const clean = runGateOn({
  'engine/match/score.ts': "import { normalise } from '../normalise/index';\nexport const s = normalise;\n",
});
eq(clean.code, 0, 'a clean engine/ file must pass the gate');

const total = globCases.length
  + Object.values(FIXTURES).reduce((n, f) => n + f.bad.length + f.good.length, 0)
  + 3
  + 5
  + 7;
console.log(failed === 0
  ? `\nselftest: all ${total} assertions passed`
  : `\nselftest: ${failed} FAILURE(S) of ${total}`);
process.exit(failed === 0 ? 0 : 1);
