// Orchestrator-owned. Quarantine trigger Q4' (AMENDMENT 01 §5).
//
// The original Q4 — quarantine when false_clears rises after a merge — quarantines
// correct work. false_clears is an ABSOLUTE COUNT over a fixed 200 rows, and coverage
// climbs monotonically through Waves 3 and 4 as fuzzy matching, cardinality resolution
// and LLM residuals each decide rows previously left to a human. Some fraction of newly
// decided rows will be wrong. The count rises BECAUSE the system got more capable. As
// written the rule fires on W04b, W05c and W09 and stalls the run with no human to appeal
// to.
//
// Q4' quarantines when:
//   1. false_clears rises AND coverage does not rise            — capability did not pay
//   2. rupees_at_risk breaches its floor                        — the amount cap leaked
//   3. false_clears / decided_count worsens beyond the delta    — correctness traded away
//
// It catches the silent regression, not the unflattering result. Whatever the number is
// at the end, it ships.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const REPORT = join(ROOT, 'eval', 'report.json');
const PREV = join(ROOT, 'eval', 'report.prev.json');
const THRESHOLDS = join(ROOT, 'eval', 'thresholds.json');

// The shape eval/report.json must expose for this gate to function. W03 builds to this.
// A missing key is a contract failure, not a reason to skip the check.
const REQUIRED = [
  'totals.decided_count',
  'totals.coverage',
  'totals.false_clears',
  'totals.rupees_at_risk_paise',
];

const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

if (!existsSync(REPORT)) {
  console.log('regression: eval/report.json does not exist yet — skipping');
  process.exit(0);
}

const th = JSON.parse(readFileSync(THRESHOLDS, 'utf8'));
const floors = th.floors;
const maxWorsening = th.regression.max_false_clear_rate_worsening.value;

const cur = JSON.parse(readFileSync(REPORT, 'utf8'));

const missing = REQUIRED.filter((k) => dig(cur, k) === undefined);
if (missing.length) {
  console.error('regression: FAIL — eval/report.json is missing required key(s):');
  for (const k of missing) console.error(`  ${k}`);
  console.error('\nThis gate reads the report programmatically. A report it cannot read is a');
  console.error('report nobody can audit. Fix the harness; do not remove the gate.');
  process.exit(1);
}

const failures = [];
const notes = [];

const c = {
  decided: dig(cur, 'totals.decided_count'),
  coverage: dig(cur, 'totals.coverage'),
  falseClears: dig(cur, 'totals.false_clears'),
  rupeesAtRisk: dig(cur, 'totals.rupees_at_risk_paise'),
};
c.rate = c.decided > 0 ? c.falseClears / c.decided : 0;

// ── absolute floors, always checked ─────────────────────────────────────────────
if (c.coverage < floors.coverage_min.value) {
  failures.push(`coverage ${c.coverage} is below the floor ${floors.coverage_min.value}`);
}
if (c.falseClears > floors.false_clears_max.value) {
  failures.push(`false_clears ${c.falseClears} exceeds the ceiling ${floors.false_clears_max.value}`);
}
if (c.rupeesAtRisk > floors.rupees_at_risk_max_paise.value) {
  failures.push(
    `rupees_at_risk ${c.rupeesAtRisk} paise exceeds the ceiling ` +
    `${floors.rupees_at_risk_max_paise.value} paise — the amount cap is not being enforced`
  );
}

// ── Q4': the comparison against the previous run ────────────────────────────────
if (!existsSync(PREV)) {
  notes.push('no eval/report.prev.json — first live run, compared against floors alone');
} else {
  const prev = JSON.parse(readFileSync(PREV, 'utf8'));
  const p = {
    decided: dig(prev, 'totals.decided_count'),
    coverage: dig(prev, 'totals.coverage'),
    falseClears: dig(prev, 'totals.false_clears'),
  };
  p.rate = p.decided > 0 ? p.falseClears / p.decided : 0;

  const falseClearsRose = c.falseClears > p.falseClears;
  const coverageRose = c.coverage > p.coverage;

  if (falseClearsRose && !coverageRose) {
    failures.push(
      `QUARANTINE Q4' — false_clears rose ${p.falseClears} -> ${c.falseClears} while ` +
      `coverage did not rise (${p.coverage} -> ${c.coverage}). Capability did not pay for the errors.`
    );
  } else if (falseClearsRose) {
    notes.push(
      `false_clears rose ${p.falseClears} -> ${c.falseClears}, but coverage rose ` +
      `${p.coverage} -> ${c.coverage}. Expected: newly decided rows include newly wrong ones. Not a regression.`
    );
  }

  const worsening = c.rate - p.rate;
  if (worsening > maxWorsening) {
    failures.push(
      `QUARANTINE Q4' — false-clear rate worsened by ${worsening.toFixed(4)} ` +
      `(${p.rate.toFixed(4)} -> ${c.rate.toFixed(4)}), beyond the allowed ${maxWorsening}. ` +
      `Correctness is being traded for coverage.`
    );
  }
}

for (const n of notes) console.log(`regression: ${n}`);

if (failures.length === 0) {
  console.log(
    `regression: ok — coverage ${c.coverage}, false_clears ${c.falseClears}, ` +
    `rupees_at_risk ${c.rupeesAtRisk} paise, rate ${c.rate.toFixed(4)}`
  );
  process.exit(0);
}

console.error(`\nregression: FAIL — ${failures.length} condition(s)\n`);
for (const f of failures) console.error(`  ${f}`);
console.error('\nDo not widen a floor to clear this. That is quarantine Q2 — the same move the');
console.error('incumbent ERP calls "change the tolerance", and we refuse it for the same reason.');
process.exit(1);
