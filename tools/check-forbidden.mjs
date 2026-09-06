// Orchestrator-owned. CI gate: the grep wall.
//
// Each rule encodes a claim we make on camera. If a rule fires, either the code is wrong
// or the claim is. Never weaken a rule to go green — that is quarantine trigger Q3.
//
// Rules are scoped by glob so they stay precise. A gate that cries wolf gets disabled by
// the third worker who trips it, which would be worse than having no gate at all.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { matchesAny } from './_glob.mjs';

// `--root <dir>` lets the firewall positive test point the gate at a fixture tree.
// A firewall never observed to fail is not evidence of a firewall.
const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag !== -1 && process.argv[rootFlag + 1]
  ? process.argv[rootFlag + 1]
  : new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Files that quote the banned strings in order to ban them.
const SELF_EXEMPT = [
  'tools/**',
  '.github/**',
  'AGENTS.md',
  'CODEOWNERS',
  'HOLDFAST-ORCHESTRATION-FINAL.md',
  'HOLDFAST-HANDOFF.md',
  'CURRENT_AIM.md',
  'memory.md',
  'logs/**',
  'critique/**',
  'quarantine/**',
  'pnpm-lock.yaml',
];

const SCANNABLE = /\.(ts|tsx|js|jsx|mjs|cjs|sql|json|md|css|ya?ml)$/;

export const RULES = [
  {
    id: 'money-float',
    why: 'Money is integer paise. A float in a money path is a rounding bug with a plausible face.',
    include: ['**'],
    pattern: /parseFloat[ ]*\(/,
  },
  {
    id: 'money-number-cast',
    why: 'Number() on a monetary field silently produces a float. Parse to BigInt paise instead.',
    include: ['**'],
    pattern: /Number[ ]*\([^)]*(amount|paise|price|total|balance|subtotal|gross|net|tax)/i,
  },
  {
    id: 'append-only-delete',
    why: 'Append-only is a claim we make on camera. No DELETE, no soft-delete, anywhere.',
    include: ['**'],
    pattern: /DELETE[ ]+FROM|TRUNCATE[ ]+TABLE|DROP[ ]+TABLE|deleted_at/i,
  },
  {
    id: 'append-only-orm-delete',
    // Scoped: llm/** legitimately evicts from an in-memory Map cache. Everywhere else,
    // `.delete(` means data loss. The database GRANT (W01) is the real enforcement;
    // this is the static half of the same claim.
    why: 'Append-only. A .delete() on a data path contradicts the audit journal.',
    include: ['db/**', 'app/api/**', 'engine/**', 'export/**', 'scripts/**'],
    pattern: /\.delete[ ]*\(/,
  },
  {
    id: 'ui-metric-literal',
    why: 'No numeric metric literals under app/. Metrics come from the API or are not shown.',
    include: ['app/**', 'components/**'],
    pattern: /(?<![\w.-])[0-9]{2}\.[0-9](?![\w-])|(?<![\w.-])[0-9]{1,3}\.[0-9]+[ ]*%/,
  },
  {
    id: 'firewall-import',
    why: 'THE FIREWALL. The generator and the matcher are never in one workspace.',
    include: ['engine/**', 'llm/**', 'app/**', 'components/**'],
    pattern: /(from|require|import)[^\n]{0,40}['"`][^'"`\n]*scripts\//,
  },
  {
    id: 'firewall-truth',
    // The sharpest edge of the firewall: engine/ reading the answer key would make the
    // headline number an artifact, which is exactly what critic C1 is told to hunt for.
    why: 'THE FIREWALL. Only eval/ may read the answer key. The engine must never see truth.json.',
    include: ['engine/**', 'llm/**', 'app/**', 'components/**'],
    pattern: /truth\.json|data\/truth/,
  },
  {
    id: 'payment-execution',
    why: 'No payment execution code. Not disabled, not flagged — absent.',
    include: ['**'],
    pattern: /(execute|initiate|send|disburse|release|submit)[_ ]?Payment(Run|Batch|File)?[ ]*\(/i,
  },
  {
    id: 'model-confidence',
    why: 'The model\'s self-reported confidence is not evidence and does not exist in this codebase.',
    include: ['lib/**', 'llm/**', 'engine/**', 'app/**', 'components/**'],
    pattern: /(self[_ ]?reported[_ ]?confidence|model[_ ]?confidence|llm[_ ]?confidence)/i,
  },
  {
    id: 'overclaim',
    why: 'Agent-written marketing copy. We do not make claims we cannot evidence.',
    include: ['**'],
    pattern: /SOC[ ]?2|\bcompliant\b|compliance[- ]ready|\bcertified\b|continuously[ ]learns?|continuous[ ]learning|enterprise[- ]ready|bank[- ]grade|military[- ]grade/i,
  },
  {
    id: 'learning-vocabulary',
    why: 'Persisted vendor mappings are "feedback rules", never "learning".',
    include: ['app/**', 'components/**', 'export/**', 'README.md', 'DEVPOST.md', 'docs/**'],
    pattern: /machine[ ]learning|self[- ]learning|the[ ]model[ ]learns/i,
  },
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git' || e === '.next' || e === 'out') continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function main() {
  const files = walk(ROOT)
    .map((f) => relative(ROOT, f).split(sep).join('/'))
    .filter((f) => SCANNABLE.test(f))
    .sort();

  const violations = [];

  for (const rel of files) {
    const exempt = matchesAny(rel, SELF_EXEMPT);
    let text;
    try { text = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);

    for (const rule of RULES) {
      if (exempt) continue;
      if (!matchesAny(rel, rule.include)) continue;
      lines.forEach((line, i) => {
        if (rule.pattern.test(line)) {
          violations.push({ rule, file: rel, line: i + 1, text: line.trim().slice(0, 120) });
        }
      });
    }
  }

  if (violations.length === 0) {
    console.log(`forbidden: clean — ${RULES.length} rules across ${files.length} scanned file(s)`);
    return 0;
  }

  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.rule.id)) byRule.set(v.rule.id, []);
    byRule.get(v.rule.id).push(v);
  }

  console.error(`\nforbidden: FAIL — ${violations.length} violation(s)\n`);
  for (const [id, vs] of byRule) {
    console.error(`  [${id}] ${vs[0].rule.why}`);
    for (const v of vs) console.error(`    ${v.file}:${v.line}  ${v.text}`);
    console.error('');
  }
  console.error('Fix the code. Never edit this file to go green — that is quarantine trigger Q3.');
  return 1;
}

// Importable for tools/selftest.mjs; still a CLI when run directly.
const invokedDirectly = Boolean(process.argv[1]) && process.argv[1].endsWith('check-forbidden.mjs');
if (invokedDirectly) process.exit(main());
